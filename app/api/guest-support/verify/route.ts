import { NextRequest, NextResponse } from 'next/server'
import { COOKIE, issue, expiryFor, cookieOptions } from '@/lib/guest/session'
import { verifyBooking, callerIp } from '@/lib/guest/verify-booking'
import { loadHistory } from '@/lib/guest/booking'

/*  Verify a guest by confirmation code plus last name, across both booking
 *  tables. The matching itself now lives in lib/guest/verify-booking so the
 *  session route asks the identical question of the identical code — two copies
 *  of a security check drift, and the one that matters is whichever the attacker
 *  found first.
 *
 *  THE CODE IS EXCHANGED FOR A SESSION HERE AND THEN LET GO. It used to be kept
 *  in localStorage and re-POSTed on every page load; now a successful
 *  verification hands back an httpOnly cookie carrying the BOOKING, signed. If
 *  GUEST_SESSION_SECRET is missing nothing is issued and the guest simply types
 *  the code again — the mechanism fails closed rather than falling back to a key
 *  published in the repository. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const result = await verifyBooking({
    code: body?.code, lastName: body?.lastName, ip: callerIp(request.headers),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  const booking = result.booking
  const res = NextResponse.json({
    ok: true, booking, history: await loadHistory(booking.booking_id),
  })
  const exp = expiryFor(booking.check_out)
  const token = issue({ bid: booking.booking_id, kind: booking.source, pid: booking.property_id, exp })
  if (token) res.cookies.set(COOKIE, token, cookieOptions(exp))
  return res
}
