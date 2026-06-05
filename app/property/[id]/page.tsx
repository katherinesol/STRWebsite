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
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 380px',
          gap: '0',
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '48px 40px',
          alignItems: 'start',
        }}>
          <div style={{ paddingRight: '60px' }}>
            <PropertyOverview property={property} />
            <PropertyAmenities property={property} />
            <PropertyFAQ property={property} />
            <NeighbourhoodMap property={property} />
          </div>
          <div style={{ position: 'sticky', top: '80px' }}>
            <BookingWidget property={property} />
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}
