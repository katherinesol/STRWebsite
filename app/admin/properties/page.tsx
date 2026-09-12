import { redirect } from 'next/navigation'

/*  Migrated to /keyholder/property.
 *
 *  Redirected rather than deleted: the new-shell equivalent does everything this
 *  page did, so nothing is lost, and a redirect keeps every bookmark, old link
 *  and browser-history entry working. Deleting would 404 them for no gain.
 *
 *  ITS SIBLING /admin/properties/[id]/photos IS DELIBERATELY NOT REDIRECTED. The
 *  Photos tab has not been built, so that page is still the only place photo
 *  management exists — redirecting it would 404 a real capability rather than
 *  migrate it. /keyholder/property links to it directly and says what it is. */
export default function LegacyRedirect() {
  redirect('/keyholder/property')
}
