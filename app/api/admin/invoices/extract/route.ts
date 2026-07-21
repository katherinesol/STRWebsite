import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole } from '@/lib/auth'
import { EXPENSE_CATEGORIES } from '@/lib/expense-categories'

export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('receipt') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  let receipt_path: string | null = null
  // save receipt to storage (non-blocking for extraction)
  try {
    const supabase = createAdminClient()
    const ext = file.name.split('.').pop() || 'jpg'
    receipt_path = `invoice-receipts/${Date.now()}.${ext}`
    const bytes = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('property-management')
      .upload(receipt_path, bytes, { contentType: file.type })
    if (uploadError) { console.error('Receipt upload failed:', uploadError.message); receipt_path = null }
  } catch (e) { console.error('Receipt storage error (continuing):', e); receipt_path = null }

  // build content block
  let contentBlock: any
  if (file.type === 'application/pdf') {
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    contentBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
  } else {
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const mediaType = (file.type || 'image/jpeg') as any
    contentBlock = { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [contentBlock, {
          type: 'text',
          text: `Extract data from this contractor invoice or receipt. Return ONLY valid JSON, no markdown, no explanation:
{
  "contractor_name": "person or business name issuing the invoice, or null",
  "company": "company name if distinct from contractor_name, or null",
  "date": "YYYY-MM-DD or null",
  "items": [{"description": "line item", "amount": 0.00}],
  "hst": 0.00,
  "total": 0.00,
  "category": "one of: ${EXPENSE_CATEGORIES.join(' | ')}"
}
Rules:
- Extract every visible line item with its pre-tax amount.
- "hst" is the HST/GST tax amount (Ontario 13%), null if not shown separately.
- "total" is the final amount including tax.
- Numbers only, no currency symbols or commas.
- Use null (or [] for items) for anything genuinely absent.`,
        }],
      }],
    })
    const textBlock = response.content.find((b: any) => b.type === 'text')
    const text = (textBlock && 'text' in textBlock ? textBlock.text : '{}') || '{}'
    const clean = text.replace(/```json|```/g, '').trim()
    const data = JSON.parse(clean)
    return NextResponse.json({ ok: true, extracted: data, receipt_path })
  } catch (err: any) {
    return NextResponse.json({ error: 'Extraction failed: ' + (err?.message || 'unknown'), receipt_path }, { status: 500 })
  }
}
