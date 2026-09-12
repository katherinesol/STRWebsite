import { redirect } from 'next/navigation'

/*  Migrated to /keyholder/property/[id]/photos.
 *
 *  This was the last property page held back, and deliberately so: while the
 *  Photos tab did not exist, redirecting would have 404'd the only place photo
 *  management lived rather than migrating it. The tab exists now, running the
 *  same PhotoManager against the same routes, so the capability has actually
 *  moved and the redirect is honest.
 *
 *  With this, every /admin property page redirects and the editor is complete. */
export default async function LegacyRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/keyholder/property/${id}/photos`)
}
