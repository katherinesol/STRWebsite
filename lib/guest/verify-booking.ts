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

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { surnameOf } from '@/lib/keyholder/guest-match'
import type { GuestBooking } from '@/lib/guest/booking'

export type VerifyOutcome =
  | { ok: true; booking: GuestBooking }
  | { ok: false; status: 400 | 403 | 404 | 429 | 503; error: string }

/** How far past checkout a code keeps working. */
const GRACE_DAYS = 3

/*  TWO LIMITERS, NOT ONE, because they stop different attacks.
 *
 *  PER IP catches somebody working through codes from one machine. It is the
 *  weaker of the two and always was: addresses are rented by the hour.
 *
 *  PER CODE catches the attack that actually fits this gate. The code is the
 *  secret; the surname is not — surnames are on the public record. An attacker
 *  holding ONE code, from a forwarded email or a referrer log, needs only to
 *  guess a surname, and can do that from as many addresses as they like. Per-IP
 *  counting never sees that run. A per-code counter sees it wherever it comes
 *  from.
 *
 *  The thresholds are deliberately loose: the codes are high-entropy — 36^8 for
 *  Airbnb, 36^6 for Houfy — so this is depth, not the wall. Ten misses in an
 *  hour is far beyond a guest mistyping their own surname and far below anything
 *  that would make guessing viable. */
const MAX_FAILS_PER_IP = 8
const IP_WINDOW_MINUTES = 15
const MAX_FAILS_PER_CODE = 10
const CODE_WINDOW_MINUTES = 60

/*  Hashed with a server-side pepper, never stored raw. A rate-limit table
 *  holding plaintext confirmation codes would be a log that is also a
 *  credential dump — every code anyone ever typed, including the correct ones.
 *  The pepper is GUEST_SESSION_SECRET, which already exists and already fails
 *  closed when it is missing. */
function codeHash(code: string): string | null {
  const pepper = process.env.GUEST_SESSION_SECRET
  if (!pepper || pepper.trim().length < 16) return null
  return createHash('sha256').update(pepper.trim() + ':' + code.toUpperCase()).digest('hex')
}

/** What a caller is told when the limiter itself cannot be trusted. */
const CANNOT_COUNT = 'We could not process that just now. Please try again in a moment, or contact your host directly.'

export async function verifyBooking(
  { code, lastName, ip }: { code: unknown; lastName: unknown; ip: string },
  now = new Date(),
  /*  A seam, and it earns its place: the fail-closed path is the whole point of
   *  the limiter and it cannot be exercised against a database that works. With
   *  no override this is exactly the admin client, so production behaviour is
   *  unchanged. */
  client?: ReturnType<typeof createAdminClient>,
): Promise<VerifyOutcome> {
  const codeRaw = typeof code === 'string' ? code.trim() : ''
  const nameRaw = typeof lastName === 'string' ? lastName.trim() : ''
  if (!codeRaw || !nameRaw) {
    return { ok: false, status: 400, error: 'Enter your confirmation code and last name' }
  }

  const supabase = client ?? createAdminClient()
  const codeUp = codeRaw.toUpperCase()
  const lastLower = nameRaw.toLowerCase()

  const hash = codeHash(codeUp)

  /*  FAIL CLOSED. If the limiter cannot count, the verification does not happen.
   *
   *  This block used to be wrapped in a bare try/catch, so a failing count query
   *  meant "no limit found" and the request sailed through UNCOUNTED. A limiter
   *  that depends on logging and fails open is not a limiter — it is one
   *  database hiccup away from an unlimited guessing window, and nothing would
   *  have said so. Refusing is the correct answer: a verification that cannot be
   *  rate-limited is one that should not proceed. */
  try {
    const ipSince = new Date(now.getTime() - IP_WINDOW_MINUTES * 60_000).toISOString()
    const { count: ipFails, error: ipErr } = await supabase.from('verify_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip).eq('success', false).gte('created_at', ipSince)
    if (ipErr) throw ipErr
    if ((ipFails || 0) >= MAX_FAILS_PER_IP) {
      return { ok: false, status: 429, error: 'Too many attempts. Please wait a few minutes and try again, or contact your host directly.' }
    }

    if (hash) {
      const codeSince = new Date(now.getTime() - CODE_WINDOW_MINUTES * 60_000).toISOString()
      const { count: codeFails, error: codeErr } = await supabase.from('verify_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('code_hash', hash).eq('success', false).gte('created_at', codeSince)
      if (codeErr) throw codeErr
      if ((codeFails || 0) >= MAX_FAILS_PER_CODE) {
        /*  Deliberately the same wording as the per-IP refusal. Telling an
         *  attacker WHICH limit they hit tells them the code is real. */
        return { ok: false, status: 429, error: 'Too many attempts. Please wait a few minutes and try again, or contact your host directly.' }
      }
    }
  } catch {
    return { ok: false, status: 503, error: CANNOT_COUNT }
  }

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

  /*  The attempt is recorded BEFORE the answer is given, and a failure to
   *  record refuses the request. An uncounted attempt is a free guess, and free
   *  guesses are the entire thing the limiter exists to prevent. */
  const recorded = await record(supabase, { ip, code_hash: hash, success: !!match })
  if (!recorded) return { ok: false, status: 503, error: CANNOT_COUNT }

  if (!match) {
    return { ok: false, status: 404, error: 'No booking found with that code and last name. Please check and try again.' }
  }

  if (match.check_out < windowStart) {
    return { ok: false, status: 403, error: 'This booking has ended. Please contact the host directly.' }
  }
  return { ok: true, booking: match }
}

/*  Writing the attempt down. Returns false if it could not be written, and the
 *  caller refuses on false — see the comment at the call site. Exported so the
 *  fail-closed path can be exercised with a client whose insert fails. */
export async function record(
  supabase: { from: (t: string) => { insert: (v: any) => PromiseLike<{ error: unknown }> } },
  row: { ip: string; code_hash: string | null; success: boolean },
): Promise<boolean> {
  try {
    const { error } = await supabase.from('verify_attempts').insert(row)
    return !error
  } catch {
    return false
  }
}

/** The address a request arrived from, as the attempt limit counts it. */
export const callerIp = (h: Headers) =>
  h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
