import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// Verify a guest by confirmation code + last name. Checks both direct bookings and platform bookings.
export async function POST(request: NextRequest) {
  const { code, lastName } = await request.json()
  if (!code?.trim() || !lastName?.trim()) {
    return NextResponse.json({ error: 'Enter your confirmation code and last name' }, { status: 400 })
  }
  const supabase = createAdminClient()
  const codeUp = code.trim().toUpperCase()
  const lastLower = lastName.trim().toLowerCase()

  // ATTEMPT LIMIT: block brute-forcing codes (max 8 failed tries per IP per 15 min)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  try {
    const since = new Date(Date.now() - 15 * 60000).toISOString()
    const { count } = await supabase.from('verify_attempts').select('*', { count: 'exact', head: true }).eq('ip', ip).eq('success', false).gte('created_at', since)
    if ((count || 0) >= 8) {
      return NextResponse.json({ error: 'Too many attempts. Please wait a few minutes and try again, or contact your host directly.' }, { status: 429 })
    }
  } catch {}

  // access window: stay dates ± 3 days
  const now = new Date()
  const windowStart = new Date(now.getTime() - 3 * 86400000).toISOString().split('T')[0]

  // 1. direct bookings (join guest for name)
  const { data: direct } = await supabase
    .from('bookings')
    .select('id, property_id, check_in, check_out, confirmation_code, status, lock_code, total, deposit_amount, deposit_paid_at, final_payment_amount, final_paid_at, guest:guests(name, phone)')
    .ilike('confirmation_code', codeUp)
    .neq('status', 'cancelled')

  // 2. platform bookings
  const { data: platform } = await supabase
    .from('calendar_blocks')
    .select('id, property_id, start_date, end_date, confirmation_code, guest_name, door_code, guest_total, payout_amount')
    .ilike('confirmation_code', codeUp)

  // match last name
  const nameMatches = (full: string | null | undefined) => {
    if (!full) return false
    const parts = full.toLowerCase().trim().split(/\s+/)
    return parts[parts.length - 1] === lastLower || parts.includes(lastLower)
  }

  let match: any = null
  for (const b of (direct || [])) {
    if (nameMatches((b.guest as any)?.name)) {
      match = {
        source: 'direct', booking_id: b.id, property_id: b.property_id,
        guest_name: (b.guest as any)?.name, check_in: b.check_in, check_out: b.check_out,
        door_code: b.lock_code,
        payment: { total: b.total, deposit_paid: !!b.deposit_paid_at, final_paid: !!b.final_paid_at },
      }
      break
    }
  }
  if (!match) {
    for (const b of (platform || [])) {
      if (nameMatches(b.guest_name)) {
        match = {
          source: 'platform', booking_id: b.id, property_id: b.property_id,
          guest_name: b.guest_name, check_in: b.start_date, check_out: b.end_date,
          door_code: b.door_code,
          payment: { total: b.guest_total, note: 'Paid through platform' },
        }
        break
      }
    }
  }

  if (!match) {
    try { await supabase.from('verify_attempts').insert({ ip, success: false }) } catch {}
    return NextResponse.json({ error: 'No booking found with that code and last name. Please check and try again.' }, { status: 404 })
  }
  // log success
  try { await supabase.from('verify_attempts').insert({ ip, success: true }) } catch {}

  // access window check
  if (match.check_out < windowStart) {
    return NextResponse.json({ error: 'This booking has ended. Please contact the host directly.' }, { status: 403 })
  }

  // load persisted chat history for this booking (so guests can scroll back their whole stay)
  let history: any[] = []
  try {
    const { data: conv } = await supabase.from('conversations').select('id').eq('booking_id', match.booking_id).maybeSingle()
    if (conv) {
      const { data: msgs } = await supabase.from('messages').select('sender, body').eq('conversation_id', conv.id).order('created_at')
      history = (msgs || [])
        .filter((m: any) => m.sender === 'guest' || m.sender === 'ai')
        .filter((m: any) => !String(m.body).startsWith('Auto-escalated:'))  // hide the host-only flag from the guest
        .map((m: any) => ({ role: m.sender === 'guest' ? 'user' : 'assistant', content: m.body }))
    }
  } catch {}

  return NextResponse.json({ ok: true, booking: match, history })
}
