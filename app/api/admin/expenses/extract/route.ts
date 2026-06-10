import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

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
  const file = formData.get('receipt') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  // upload to storage first
  const supabase = createAdminClient()
  const ext = file.name.split('.').pop()
  const path = `receipts/${Date.now()}.${ext}`
  const bytes = await file.arrayBuffer()
  const { data: uploadData } = await supabase.storage
    .from('property-management')
    .upload(path, bytes, { contentType: file.type })

  let receipt_url = null
  if (uploadData) {
    const { data: urlData } = supabase.storage.from('property-management').getPublicUrl(path)
    receipt_url = urlData.publicUrl
  }

  // convert to base64 for Claude
  const base64 = Buffer.from(bytes).toString('base64')
  const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp'

  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `Extract the following from this receipt and return ONLY valid JSON, no other text:
{
  "vendor": "store/business name",
  "amount": 0.00,
  "hst": 0.00,
  "date": "YYYY-MM-DD",
  "description": "brief description of what was purchased",
  "category": "best matching category from this list: ${CATEGORIES.join(', ')}"
}
If you cannot determine a value, use null. For date, use today's date if not visible.`,
          },
        ],
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const extracted = JSON.parse(clean)

    return NextResponse.json({ extracted: true, ...extracted, receipt_url })
  } catch (err) {
    console.error('AI extraction error:', err)
    return NextResponse.json({ extracted: false, receipt_url })
  }
}
