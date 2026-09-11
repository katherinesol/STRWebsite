import { notFound } from 'next/navigation'
import { siteConfig } from '@/lib/site-config'
import { loadProperty } from '@/lib/properties-db'
import GuestHub from '@/components/guest/GuestHub'

export const dynamic = 'force-dynamic'

/*  FIRST READER ON THE TABLE.
 *
 *  loadProperty merges the `properties` table over lib/properties.ts: a field the
 *  table has wins, a field it leaves null falls through to the file. So editing a
 *  description in the new property editor shows up here with no deploy, and a
 *  half-migrated or entirely missing row renders exactly what the site rendered
 *  before — which is why the hub goes first. It sits behind a booking link, is
 *  not indexed, and its audience has already booked, while reading the widest
 *  slice of the content: POIs, check-in and check-out, parking, the Houfy URL,
 *  amenities and the description.
 *
 *  Contact details stay in the environment and are passed down. A blank stays
 *  blank: the hub hides a channel it has no address for rather than printing a
 *  placeholder a guest might actually try. */
export default async function HubPage({ params }: { params: Promise<{ property: string }> }) {
  const { property } = await params
  const prop = await loadProperty(property)
  if (!prop) notFound()

  return (
    <GuestHub
      propertyId={property}
      propertyName={prop.name}
      houfyUrl={prop.houfyUrl}
      contact={{ email: siteConfig.contact.supportEmail, phone: siteConfig.contact.phone }}
      data={{
        checkIn: prop.checkIn,
        checkOut: prop.checkOut,
        amenities: prop.amenities || [],
        houseRules: prop.houseRules || [],
        faq: prop.faq || [],
        highlights: prop.highlights || [],
        areaDescription: prop.areaDescription || '',
        description: prop.description || '',
        pois: prop.pois || [],
        parkingSpots: prop.parkingSpots ?? 0,
      }}
    />
  )
}
