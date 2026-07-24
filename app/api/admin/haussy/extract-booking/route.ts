import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { hasRole } from '@/lib/auth'

export async function POST(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { images } = await request.json()  // array of { data (base64), mediaType }
  if (!Array.isArray(images) || !images.length) return NextResponse.json({ error: 'No images' }, { status: 400 })

  const imageBlocks = images.map((img: any) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: (img.mediaType || 'image/jpeg') as any, data: img.data },
  }))

  const prompt = `These are screenshot(s) of a short-term rental booking from a platform (Airbnb, VRBO, Houfy, etc.). Extract ALL booking details into JSON. Return ONLY valid JSON, no markdown:
{
  "platform": "airbnb|vrbo|houfy|other or null",
  "property_hint": "any property name/location mentioned, or null",
  "property_id": "map the property to EXACTLY one of: 'royal-york-east' (Royal York East Suite), 'royal-york-west' (Royal York West Suite), 'nickel-beach' (Nickel Beach Retreat). null if unclear",
  "guest_name": "full name or null",
  "guest_email": "or null",
  "guest_phone": "or null",
  "check_in": "YYYY-MM-DD or null",
  "check_out": "YYYY-MM-DD or null",
  "check_in_time": "e.g. '4:00 PM' or null",
  "check_out_time": "e.g. '11:00 AM' or null",
  "door_code": "access/door code digits, or null",
  "guests_adults": number or null,
  "guests_children": number or null,
  "guests_count": number or null,
  "nights": number or null,
  "nightly_rate": number or null,
  "accommodation": number or null,
  "cleaning_fee": number or null,
  "extras": number or null,
  "discount": number or null,
  "guest_service_fee": number or null,
  "occupancy_taxes": number or null,
  "taxes_collected": number or null,
  "guest_total": number or null,
  "payout_amount": number or null,
  "commission": number or null,
  "payment_processing_fee": number or null,
  "taxes_platform_remits": number or null,
  "confirmation_code": "or null"
}
Rules:
- Today's date is ${new Date().toISOString().split('T')[0]}. If a screenshot shows dates WITHOUT a year, assume the current year or the nearest UPCOMING occurrence — never a past year. A booking should almost never be in the past.
- guests_count = total number of guests in the party (e.g. 'Erica's group of 3' means 3). Add adults + children if shown separately.
- Combine info across multiple screenshots into one booking.
- Numbers only, no currency symbols/commas. Always positive — strip any minus sign. Deductions like commission and processing fees are shown negative on statements but must be recorded as positive amounts.
- accommodation = the room/nightly subtotal before fees/taxes (host side).
- extras = additional guest-charged fees such as pet fee, extra guest fee, or resort fee. Add them together if there are several.
- discount = any negative rate adjustment or discount (store as a positive number). E.g. "Nightly rate adjustment -$125.10" means discount: 125.10.
- commission = the fee the platform charges the host. Airbnb calls it "Host service fee", VRBO calls it "Vrbo commission".
- payment_processing_fee = VRBO's payment processing fee, if shown. Airbnb and Houfy have none.
- HOUFY takes NO commission — set commission to 0, never guess one. Its "Reservation Code" is the confirmation_code. "Special Discount" is the discount. "houfyProtect" is an extra charged to the guest. Its single "Tax 17%" line is the total tax collected. Its Total is what the guest paid; use that as payout_amount.
- VRBO shows TWO tax lines. "Lodging taxes you remit" is the host's and goes in occupancy_taxes. "Lodging taxes we remit" is the platform's own and goes in taxes_platform_remits — never combine them.
- VRBO's "Guest service fee" appears as both a charge and a deduction and nets to zero for the host — put it in guest_service_fee, not in any total.
- guest_service_fee = the service fee charged to the GUEST.
- occupancy_taxes = occupancy/lodging taxes collected from the guest (this is taxes_collected too if not separately shown).
- accommodation = subtotal for the stay before fees/taxes.
- guest_total = what the guest paid total. payout_amount = what the host receives.
- Use null for anything not visible. Do not guess or invent numbers.`

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create({
      model: 'claude-opus-4-5',  // vision accuracy matters for pricing
      max_tokens: 1500,
      messages: [{ role: 'user', content: [...imageBlocks, { type: 'text' as const, text: prompt }] as any }],
    })
    const textBlock = msg.content.find((b: any) => b.type === 'text')
    const raw = (textBlock && 'text' in textBlock ? textBlock.text : '{}') || '{}'
    const data = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return NextResponse.json({ ok: true, extracted: data })
  } catch (err: any) {
    return NextResponse.json({ error: 'Extraction failed: ' + (err?.message || 'unknown') }, { status: 500 })
  }
}
