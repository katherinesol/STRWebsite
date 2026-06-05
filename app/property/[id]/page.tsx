import { notFound } from 'next/navigation'
import { getProperty, getAllProperties } from '@/lib/properties'
import Nav from '@/components/ui/Nav'
import Footer from '@/components/ui/Footer'
import PropertyHero from '@/components/property/PropertyHero'
import PropertyOverview from '@/components/property/PropertyOverview'
import PropertyAmenities from '@/components/property/PropertyAmenities'
import PropertyFAQ from '@/components/property/PropertyFAQ'
import NeighbourhoodMap from '@/components/property/NeighbourhoodMapWrapper'
import BookingWidget from '@/components/booking/BookingWidget'

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

  return (
    <>
      <Nav />
      <div style={{ marginTop: '56px' }}>
        <PropertyHero property={property} />
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
          <div className="prop-detail-sidebar" style={{ position: 'sticky', top: '80px' }}>
            <BookingWidget property={property} />
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
