import { NextResponse } from 'next/server'
import { hasRole, hasPermission } from '@/lib/auth'

/*  One gate, because eighteen routes got it wrong the same way.
 *
 *  The security audit found the identical shape across money, guests and locks:
 *  `hasRole('owner','co-owner')` and then nothing. The role is checked, the
 *  permission is not, and a co-owner whose map explicitly says money:'none' is
 *  waved through to write invoices. permits() was never wrong — it was never
 *  consulted.
 *
 *  BOTH CHECKS OR NEITHER IS THE WHOLE POINT. Role alone answers "are you one of
 *  the two people who run this", which is not the same question as "were you
 *  given this area". Youlande is a co-owner with money, locks, guests and
 *  property all set to 'none' — deliberately — and eighteen routes did not ask.
 *
 *  A route that used to check only the role becomes:
 *
 *      const no = await requireArea('money', 'edit')
 *      if (no) return no
 *
 *  Two lines, and the refusal is identical everywhere so a caller cannot tell
 *  which half failed. Distinguishing "you are not a co-owner" from "you are, but
 *  not for money" tells an attacker which door to try next.
 *
 *  IT DOES NOT LOOSEN ANYTHING. Where a route is deliberately stricter —
 *  /admin/locks/set-code is owner-only — the permission check is ADDED beside
 *  the existing role check rather than replacing it. A security sweep that
 *  quietly widens access while it tidies is worse than the gap it closed. */

export type Area = 'money' | 'locks' | 'guests' | 'damage' | 'bookings' | 'property'

/** Returns a 403 to return, or null to continue. */
export async function requireArea(
  area: Area,
  level: 'view' | 'edit' = 'edit',
  roles: readonly string[] = ['owner', 'co-owner'],
): Promise<NextResponse | null> {
  if (!await hasRole(...(roles as [string, ...string[]]))) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  if (!await hasPermission(area, level)) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  return null
}
