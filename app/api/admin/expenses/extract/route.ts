import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/server'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === process.env.ADMIN_SECRET
}

const CATEGORIES = [
  'Platform Fees (Airbnb/VRBO)', 'Cleaning Fees', 'Utilities', 'Property Tax',
  'Insurance', 'Repairs & Maintenance', 'Furnishings & Supplies', 'Internet & Cable',
  'Vehicle (KM Method)', 'Meals', 'Materials', 'Labor', 'Renovation', 'Bank Fees', 'Other',
]

export async function POST(request: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('receipt') as File | null
  const pastedText = formData.get('text') as string | null

  if (!file && !pastedText) return NextResponse.json({ error: 'No file or text' }, { status: 400 })

  let contentBlock: any
  let receipt_path: string | null = null

  // save receipt to private storage (non-blocking for extraction)
  if (file) {
    try {
      const supabase = createAdminClient()
      const ext = file.name.split('.').pop() || 'jpg'
      receipt_path = `receipts/${Date.now()}.${ext}`
      const bytes = await file.arrayBuffer()
      const { error: uploadError } = await supabase.storage
        .from('property-management')
        .upload(receipt_path, bytes, { contentType: file.type })
      if (uploadError) {
        console.error('Receipt upload failed:', uploadError.message)
        receipt_path = null
      }
    } catch (e) {
      console.error('Receipt storage error (continuing):', e)
      receipt_path = null
    }
  }

  if (pastedText) {
    contentBlock = { type: 'text', text: `Receipt text:\n${pastedText}` }
  } else if (file!.type === 'application/pdf') {
    const bytes = await file!.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    contentBlock = {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    }
  } else {
    const bytes = await file!.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mediaType = (file!.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
    contentBlock = {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: base64 },
    }
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          contentBlock,
          {
            type: 'text',
            text: `Extract receipt data. Return ONLY valid JSON, no markdown, no explanation:
{
  "vendor": "store name",
  "amount": 0.00,
  "hst": 0.00,
  "date": "YYYY-MM-DD",
  "description": "brief description of items",
  "category": "one of: ${CATEGORIES.join(' | ')}"
}
Use null for any field you cannot determine. For date use today if not visible.`,
          },
        ],
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const clean = text.replace(/```json|```/g, '').trim()
    const extracted = JSON.parse(clean)
    return NextResponse.json({ extracted: true, ...extracted, receipt_path })
  } catch (err: any) {
    console.error('AI extraction error:', err?.message)
    return NextResponse.json({ extracted: false, error: err?.message, receipt_path })
  }
}
