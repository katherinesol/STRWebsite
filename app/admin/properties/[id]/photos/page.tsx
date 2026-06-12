import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import PhotoManager from '@/components/admin/PhotoManager'

export const dynamic = 'force-dynamic'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East Suite',
  'royal-york-west': 'Royal York West Suite',
  'nickel-beach': 'Nickel Beach Retreat',
}

export default async function PhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { data: photos } = await supabase
    .from('property_photos')
    .select('*')
    .eq('property_id', id)
    .order('sort_order')

  const withUrls = (photos || []).map(p => {
    const { data } = supabase.storage.from('property-photos').getPublicUrl(p.storage_path)
    return { ...p, url: data.publicUrl }
  })

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/admin/properties" style={{ fontSize: '11px', color: '#9A9A92', textDecoration: 'none' }}>← Properties</Link>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F5F2EC', marginTop: '8px' }}>
          {PROPERTY_NAMES[id] || id} — photos.
        </h1>
      </div>
      <PhotoManager propertyId={id} initialPhotos={withUrls} />
    </div>
  )
}
