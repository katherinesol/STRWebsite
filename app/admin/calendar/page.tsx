import { redirect } from 'next/navigation'

/*  Migrated to /keyholder/stays/calendar.
 *
 *  Redirected rather than deleted: the new-shell equivalent does everything this
 *  page did, so nothing is lost, and a redirect keeps every bookmark, old link
 *  and browser-history entry working. Deleting would 404 them for no gain.
 *
 *  This is one of the ten pages with a proven equivalent. The other 28 /admin
 *  pages are NOT redirected — most are still the only place to do what they do,
 *  and hiding them would make a capability undiscoverable rather than migrated.
 *  See the retirement report in docs/design/BACKLOG.md. */
export default function LegacyRedirect() {
  redirect('/keyholder/stays/calendar')
}
