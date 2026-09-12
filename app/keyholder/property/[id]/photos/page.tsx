import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'
import PropertyTabs from '@/components/keyholder/PropertyTabs'
import PhotoManager from '@/components/admin/PhotoManager'
import { L } from '@/lib/design-tokens'

export const dynamic = 'force-dynamic'

/*  The fourth tab, and the one that closes the editor.
 *
 *  PhotoManager is the component that has been doing this all along — same
 *  upload, tag, cover, reorder and delete against the same four routes. It moved
 *  onto the keyholder palette rather than being rebuilt, and the legacy page it
 *  used to live on now redirects here, so there is one photo manager rather than
 *  two to keep in step.
 *
 *  The signed public URL is resolved here rather than in the component, exactly
 *  as the legacy page did — storage_path is what the table holds, and a URL is
 *  what an <img> needs. */
export default async function PhotosTab({ params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) redirect('/keyholder')

  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: property }, { data: photos }] = await Promise.all([
    supabase.from('properties').select('id, name').eq('id', id).maybeSingle(),
    supabase.from('property_photos').select('*').eq('property_id', id).order('sort_order'),
  ])
  if (!property) notFound()

  const withUrls = (photos || []).map(p => ({
    ...p,
    url: supabase.storage.from('property-photos').getPublicUrl(p.storage_path).data.publicUrl,
  }))

  const canEdit = await hasPermission('property', 'edit')

  return (
    <div>
      <PropertyTabs id={id} name={property.name} active="photos" />
      {!canEdit ? (
        <div style={{ fontSize: '13.5px', color: L.inkBody }}>
          {withUrls.length} photo{withUrls.length === 1 ? '' : 's'}. Changing them is not on your account.
        </div>
      ) : (
        <>
          <div style={{
            padding: '13px 18px', marginBottom: '18px', borderRadius: '10px',
            background: L.amberWash, border: `1px solid ${L.amberLine}`,
            fontSize: '13.5px', color: L.ink, lineHeight: 1.55,
          }}>
            These are the photos guests see, in this order. Changes are live as soon as you make
            them — there is no separate save.
          </div>
          <PhotoManager propertyId={id} initialPhotos={withUrls as any} />
        </>
      )}
    </div>
  )
}
