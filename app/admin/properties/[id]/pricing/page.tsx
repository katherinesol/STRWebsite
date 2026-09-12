import { redirect } from 'next/navigation'

/*  Migrated to /keyholder/property/[id]/pricing.
 *
 *  Redirected rather than deleted: the new-shell equivalent does everything this
 *  page did, so nothing is lost, and a redirect keeps every bookmark, old link
 *  and browser-history entry working. */
export default async function LegacyRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/keyholder/property/${id}/pricing`)
}
