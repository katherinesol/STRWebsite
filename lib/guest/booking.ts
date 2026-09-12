/*  Re-reading the booking a session points at.
 *
 *  The cookie carries an id, not an answer. Every read comes back here and loads
 *  the row, so a booking cancelled or re-dated after the cookie was issued stops
 *  working immediately rather than when the cookie happens to expire. The
 *  signature proves who issued the cookie; this decides whether it still means
 *  anything.
 *
 *  The shape returned is the one /api/guest-support/verify already returns, so
 *  the client cannot tell whether it verified just now or is resuming. */

import { createAdminClient } from '@/lib/supabase/server'

export type GuestBooking = {
  source: 'direct' | 'platform'
  booking_id: string
  property_id: string
  guest_name: string | null
  check_in: string
  check_out: string
  door_code: string | null
  payment: Record<string, any>
}

/** Three days after checkout the stay is over and the session stops resolving. */
const GRACE_DAYS = 3

export async function loadSessionBooking(
  kind: 'direct' | 'platform',
  id: string,
  now = new Date(),
): Promise<GuestBooking | null> {
  const supabase = createAdminClient()
  const windowStart = new Date(now.getTime() - GRACE_DAYS * 86400000).toISOString().slice(0, 10)

  if (kind === 'direct') {
    const { data: b } = await supabase
      .from('bookings')
      .select('id, property_id, check_in, check_out, status, lock_code, total, deposit_paid_at, final_paid_at, guest:guests(name)')
      .eq('id', id).maybeSingle()
    if (!b || b.status === 'cancelled' || b.check_out < windowStart) return null
    return {
      source: 'direct', booking_id: b.id, property_id: b.property_id,
      guest_name: (b.guest as any)?.name ?? null,
      check_in: b.check_in, check_out: b.check_out, door_code: b.lock_code ?? null,
      payment: { total: b.total, deposit_paid: !!b.deposit_paid_at, final_paid: !!b.final_paid_at },
    }
  }

  const { data: b } = await supabase
    .from('calendar_blocks')
    .select('id, property_id, start_date, end_date, status, guest_name, door_code, guest_total')
    .eq('id', id).maybeSingle()
  if (!b || b.status === 'cancelled' || b.end_date < windowStart) return null
  return {
    source: 'platform', booking_id: b.id, property_id: b.property_id,
    guest_name: b.guest_name ?? null,
    check_in: b.start_date, check_out: b.end_date, door_code: b.door_code ?? null,
    payment: { total: b.guest_total, note: 'Paid through platform' },
  }
}

/** The concierge's scrollback, same filter the verify route applies. */
export async function loadHistory(bookingId: string) {
  try {
    const supabase = createAdminClient()
    const { data: conv } = await supabase.from('conversations').select('id').eq('booking_id', bookingId).maybeSingle()
    if (!conv) return []
    const { data: msgs } = await supabase.from('messages').select('sender, body').eq('conversation_id', conv.id).order('created_at')
    return (msgs || [])
      .filter((m: any) => m.sender === 'guest' || m.sender === 'ai')
      .filter((m: any) => !String(m.body).startsWith('Auto-escalated:'))
      .map((m: any) => ({ role: m.sender === 'guest' ? 'user' : 'assistant', content: m.body }))
  } catch { return [] }
}
