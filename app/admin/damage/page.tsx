import { redirect } from 'next/navigation'

/*  Migrated to /keyholder/stays/damage.
 *
 *  NOT A LIKE-FOR-LIKE MOVE — this page could not do what it appeared to do.
 *  It read r.item, r.location and r.amount_claimed from a table holding none of
 *  those columns, and embedded bookings() across a text/uuid pair with no
 *  foreign key, which makes PostgREST return an error rather than rows. It
 *  rendered "No damage reports" whatever the table contained. Its companion,
 *  /admin/damage/new, failed on every submission and swallowed the failure. The
 *  feature reported empty from both ends, for two different wrong reasons.
 *
 *  AND IT WAS IN THE WRONG SECTION. It sat under Money in the admin rail,
 *  beside Income and Expenses. A damage claim is a dispute with a guest, not
 *  revenue — nothing is earned when one is filed and nothing is earned when it
 *  is approved. Money moves, if at all, through the security deposit, and that
 *  control is on the stay. The new page is under Stays, which is what a damage
 *  report is about.
 *
 *  IT ALSO HAD NO PERMISSION CHECK. The admin layout only asks whether you are
 *  signed in, so this page was visible to a cleaner. The replacement checks
 *  damage:view, as every damage handler now does. */
export default function LegacyRedirect() {
  redirect('/keyholder/stays/damage')
}
