import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE, read } from '@/lib/guest/session'
import { loadSessionBooking, loadHistory } from '@/lib/guest/booking'

/*  Resuming a session without re-sending the credential.
 *
 *  This is what replaced "read the confirmation code out of localStorage and
 *  POST it again on every page load". The browser sends an httpOnly cookie the
 *  page's own JavaScript cannot read, the server turns it back into a booking,
 *  and the raw code never leaves the one form the guest typed it into.
 *
 *  GET returns the booking or a plain unverified — never why. A forged or stale
 *  cookie gets the same answer as no cookie, because there is nothing useful to
 *  tell whoever sent one.
 *
 *  DELETE is signing out, and it clears the cookie whether or not it was valid. */

export async function GET() {
  const jar = await cookies()
  const s = read(jar.get(COOKIE)?.value)
  if (!s) return NextResponse.json({ ok: false })

  const booking = await loadSessionBooking(s.kind, s.bid)
  if (!booking) {
    //  the booking was cancelled, re-dated or removed since the cookie was cut
    const res = NextResponse.json({ ok: false })
    res.cookies.delete(COOKIE)
    return res
  }
  return NextResponse.json({ ok: true, booking, history: await loadHistory(booking.booking_id) })
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(COOKIE)
  return res
}
