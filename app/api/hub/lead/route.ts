import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { PROPERTIES } from '@/lib/properties'

// Captures a direct-booking lead from the guest hub ("Until next time" form).
// Public + unauthenticated, so validate strictly and cap field lengths.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> | null
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const property_id = String(body?.property_id || '').trim()
  const name = String(body?.name || '').trim().slice(0, 120)
  const email = String(body?.email || '').trim().toLowerCase().slice(0, 200)
  const phone = String(body?.phone || '').trim().slice(0, 40)

  if (!PROPERTIES[property_id]) {
    return NextResponse.json({ error: 'Unknown property' }, { status: 400 })
  }
  // deliberately permissive — just enough to reject obvious junk
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Re-submitting the form updates the existing row rather than piling up duplicates.
  const { error } = await supabase
    .from('direct_booking_leads')
    .upsert(
      { property_id, name: name || null, email, phone: phone || null },
      { onConflict: 'property_id,email' }
    )

  if (error) {
    return NextResponse.json({ error: "We couldn't save your details. Please try again." }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
