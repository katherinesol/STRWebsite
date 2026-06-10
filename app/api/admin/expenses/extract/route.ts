import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
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

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
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
    return NextResponse.json({ extracted: true, ...extracted })
  } catch (err: any) {
    console.error('AI extraction error:', err?.message)
    return NextResponse.json({ extracted: false, error: err?.message })
  }
}
