import { redirect } from 'next/navigation'

/*  Retired, and redirected rather than left standing.
 *
 *  This is NOT the usual "redirected because there is an equivalent" case. The
 *  import capability is already gone: /api/admin/bookings/import answers 410 on
 *  both verbs, so the form this page rendered could be filled in, submitted, and
 *  fail — a page that looks like it works and does not. That is worse than a
 *  redirect, because it costs somebody their time and their typing before it
 *  tells them.
 *
 *  Historical bookings are now entered through the stays list, which is where
 *  this sends people. */
export default function LegacyRedirect() {
  redirect('/keyholder/stays')
}
