import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getAllProperties } from '@/lib/properties'
import { loadProperty, publicProperty } from '@/lib/properties-db'
import Nav from '@/components/ui/Nav'
import Footer from '@/components/ui/Footer'
import PropertyHero from '@/components/property/PropertyHero'
import PropertyOverview from '@/components/property/PropertyOverview'
import PropertyAmenities from '@/components/property/PropertyAmenities'
import PropertyFAQ from '@/components/property/PropertyFAQ'
import NeighbourhoodMap from '@/components/property/NeighbourhoodMapWrapper'
import BookHoufy from '@/components/property/BookHoufy'
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

  /*  THE PUBLIC LISTING, READING THE TABLE.
   *
   *  Highest-consequence surface in the migration: indexed, it is the page that
   *  sells the properties, and its CTA sends people to Houfy. So the rule that
   *  made the hub safe matters more here, not less — a field the table leaves
   *  null falls through to lib/properties.ts, and the worst a broken or missing
   *  row can do is render exactly what this page rendered before.
   *
   *  generateStaticParams still comes from the file, so the set of pages that
   *  exist is not something a bad row can change. A table that lost a property
   *  cannot un-publish it; a table that invented one cannot publish it. */
  const full = await loadProperty(id)
  if (!full) notFound()

  /*  Everything below this line receives the PUBLIC projection. The exact
   *  address never enters the payload, so it cannot be recovered from the page
   *  source — which is where it was, before. */
  const property = publicProperty(full)

  const supabase = createAdminClient()
  const { data: pricing } = await supabase
    .from('property_pricing').select('base_rate').eq('property_id', id).maybeSingle()

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
            <BookHoufy property={property} nightly={pricing?.base_rate ?? null} />
          </div>
        </div>
      </div>
      <StickyBookingCTA propertyName={property.name} fromPrice={pricing?.base_rate ?? property.nightly} houfyUrl={property.houfyUrl} />
      <Footer />
    </>
  )
}
