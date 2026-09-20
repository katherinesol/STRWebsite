/*  One verifier, because two would drift.
 *
 *  This logic lived inside /api/guest-support/verify as a route handler. The
 *  session route needs exactly the same answer to exactly the same question —
 *  "is this confirmation code plus this surname a real, current booking?" — and
 *  a second copy of a security check is a second copy that will eventually
 *  disagree with the first. The one that matters is whichever the attacker
 *  found.
 *
 *  NOTHING ABOUT THE BEHAVIOUR CHANGES. Same two tables in the same order, same
 *  surname-only match, same cancelled exclusion, same stay window, same attempt
 *  limit, same messages. The route is now a thin caller.
 *
 *  SURNAME ONLY, and the reason is on the record: this once accepted any token
 *  of the full name, so "Alain Roy" verified on "alain" as readily as on "Roy".
 *  Every extra forename was another valid answer to the same door code, and a
 *  two-word name needed roughly half the guesses it should have. */

import { createAdminClient } from '@/lib/supabase/server'
import { surnameOf } from '@/lib/keyholder/guest-match'
import type { GuestBooking } from '@/lib/guest/booking'

export type VerifyOutcome =
  | { ok: true; booking: GuestBooking }
  | { ok: false; status: 400 | 403 | 404 | 429; error: string }

/** How far past checkout a code keeps working. */
const GRACE_DAYS = 3
/** Failed attempts allowed from one address before it is turned away. */
const MAX_FAILS = 8
const WINDOW_MINUTES = 15

export async function verifyBooking(
  { code, lastName, ip }: { code: unknown; lastName: unknown; ip: string },
  now = new Date(),
): Promise<VerifyOutcome> {
  const codeRaw = typeof code === 'string' ? code.trim() : ''
  const nameRaw = typeof lastName === 'string' ? lastName.trim() : ''
  if (!codeRaw || !nameRaw) {
    return { ok: false, status: 400, error: 'Enter your confirmation code and last name' }
  }

  const supabase = createAdminClient()
  const codeUp = codeRaw.toUpperCase()
  const lastLower = nameRaw.toLowerCase()

  /*  The attempt limit. Still counted per IP — a per-code counter is step 6 and
   *  is the one that actually matters, since rotating addresses defeats this. */
  try {
    const since = new Date(now.getTime() - WINDOW_MINUTES * 60_000).toISOString()
    const { count } = await supabase.from('verify_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip).eq('success', false).gte('created_at', since)
    if ((count || 0) >= MAX_FAILS) {
      return { ok: false, status: 429, error: 'Too many attempts. Please wait a few minutes and try again, or contact your host directly.' }
    }
  } catch {}

  const windowStart = new Date(now.getTime() - GRACE_DAYS * 86400000).toISOString().slice(0, 10)

  const [{ data: direct }, { data: platform }] = await Promise.all([
    supabase.from('bookings')
      .select('id, property_id, check_in, check_out, confirmation_code, status, lock_code, total, deposit_amount, deposit_paid_at, final_payment_amount, final_paid_at, guest:guests(name, last_name, phone)')
      .ilike('confirmation_code', codeUp).neq('status', 'cancelled'),
    supabase.from('calendar_blocks')
      .select('id, property_id, start_date, end_date, confirmation_code, guest_name, door_code, guest_total, payout_amount, guest:guests(name, last_name)')
      .neq('status', 'cancelled').ilike('confirmation_code', codeUp),
  ])

  const surnameMatches = (g: any) => surnameOf(g) === lastLower

  let match: GuestBooking | null = null
  for (const b of direct || []) {
    if (!surnameMatches(b.guest)) continue
    match = {
      source: 'direct', booking_id: b.id, property_id: b.property_id,
      guest_name: (b.guest as any)?.name ?? null,
      check_in: b.check_in, check_out: b.check_out, door_code: b.lock_code ?? null,
      payment: { total: b.total, deposit_paid: !!b.deposit_paid_at, final_paid: !!b.final_paid_at },
    }
    break
  }
  if (!match) {
    for (const b of platform || []) {
      if (!surnameMatches((b as any).guest || { name: b.guest_name })) continue
      match = {
        source: 'platform', booking_id: b.id, property_id: b.property_id,
        guest_name: b.guest_name ?? null,
        check_in: b.start_date, check_out: b.end_date, door_code: b.door_code ?? null,
        payment: { total: b.guest_total, note: 'Paid through platform' },
      }
      break
    }
  }

  if (!match) {
    try { await supabase.from('verify_attempts').insert({ ip, success: false }) } catch {}
    return { ok: false, status: 404, error: 'No booking found with that code and last name. Please check and try again.' }
  }
  try { await supabase.from('verify_attempts').insert({ ip, success: true }) } catch {}

  if (match.check_out < windowStart) {
    return { ok: false, status: 403, error: 'This booking has ended. Please contact the host directly.' }
  }
  return { ok: true, booking: match }
}

/** The address a request arrived from, as the attempt limit counts it. */
export const callerIp = (h: Headers) =>
  h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
