import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'
import PropertyTabs from '@/components/keyholder/PropertyTabs'
import GuideUpload from '@/components/admin/GuideUpload'
import { L } from '@/lib/design-tokens'

export const dynamic = 'force-dynamic'

/*  The fifth tab, and the one that should have shipped with the other four.
 *
 *  GuideUpload has existed and worked the whole time. It was mounted on
 *  /admin/properties, that page was redirected here, and the editor arrived
 *  without a Guides tab — so the component was orphaned and the capability
 *  disappeared while its four API routes stayed live. Nobody noticed for three
 *  weeks, because a redirect that loses a capability looks exactly like one that
 *  does not.
 *
 *  This is chrome and a mount, not a rebuild. Same shape as the Photos tab. */
export default async function GuidesTab({ params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) redirect('/keyholder')

  const { id } = await params
  const { data: property } = await createAdminClient()
    .from('properties').select('id, name').eq('id', id).maybeSingle()
  if (!property) notFound()

  const canEdit = await hasPermission('property', 'edit')

  return (
    <div>
      <PropertyTabs id={id} name={property.name} active="guides" />
      {canEdit ? (
        <GuideUpload propertyId={id} propertyName={property.name} />
      ) : (
        <div style={{ fontSize: '13.5px', color: L.inkBody }}>
          Changing the house guide is not on your account.
        </div>
      )}
    </div>
  )
}
