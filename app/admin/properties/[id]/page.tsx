import { redirect } from 'next/navigation'

/*  Migrated to /keyholder/property/[id] — the Content tab.
 *
 *  Redirected rather than deleted: the new-shell equivalent does everything this
 *  page did, so nothing is lost, and a redirect keeps every bookmark, old link
 *  and browser-history entry working.
 *
 *  Photos remain on /admin/properties/[id]/photos until the Photos tab is built;
 *  that page is not redirected, because it is still the only route to them. */
export default async function LegacyRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/keyholder/property/${id}`)
}
