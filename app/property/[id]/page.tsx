import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getProperty, getAllProperties } from '@/lib/properties'
import Nav from '@/components/ui/Nav'
import Footer from '@/components/ui/Footer'
import PropertyHero from '@/components/property/PropertyHero'
import PropertyOverview from '@/components/property/PropertyOverview'
import PropertyAmenities from '@/components/property/PropertyAmenities'
import PropertyFAQ from '@/components/property/PropertyFAQ'
import NeighbourhoodMap from '@/components/property/NeighbourhoodMapWrapper'
import BookingWidget from '@/components/booking/BookingWidget'
import StickyBookingCTA from '@/components/property/StickyBookingCTA'

export const revalidate = 300 // refresh photos every 5 min

export async function generateStaticParams() {
  return getAllProperties().map(p => ({ id: p.id }))
}

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const property = getProperty(id)
  if (!property) notFound()

  const supabase = createAdminClient()
  const { data: photoRows } = await supabase
    .from('property_photos')
    .select('id, storage_path, media_type, is_cover, tag, sort_order')
    .eq('property_id', id)
    .order('sort_order')
  const photos = (photoRows || []).map(p => {
    const { data } = supabase.storage.from('property-photos').getPublicUrl(p.storage_path)
    return { ...p, url: data.publicUrl }
  })

  return (
    <>
      <Nav />
      <div style={{ marginTop: '56px' }}>
        <PropertyHero property={property} photos={photos} />
        <style>{`@media (max-width: 900px) { .prop-detail-grid { grid-template-columns: 1fr !important; } .prop-detail-sidebar { position: static !important; } }`}</style>
        <div className="prop-detail-grid" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 380px',
          gap: '0',
          maxWidth: '1200px',
          margin: '0 auto',
          padding: 'clamp(24px, 5vw, 48px) clamp(20px, 5vw, 40px)',
          alignItems: 'start',
        }}>
          <div style={{ paddingRight: 'clamp(0px, 4vw, 60px)' }}>
            <PropertyOverview property={property} />
            <PropertyAmenities property={property} />
            <PropertyFAQ property={property} />
            <NeighbourhoodMap property={property} />
          </div>
          <div id="booking" className="prop-detail-sidebar" style={{ position: 'sticky', top: '80px', scrollMarginTop: '70px' }}>
            <BookingWidget property={property} />
          </div>
        </div>
      </div>
      <StickyBookingCTA propertyName={property.name} fromPrice={(property as any).base_rate || null} />
      <Footer />
    </>
  )
}
