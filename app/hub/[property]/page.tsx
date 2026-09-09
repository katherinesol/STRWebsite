import { PROPERTIES } from '@/lib/properties'
import { notFound } from 'next/navigation'
import { siteConfig } from '@/lib/site-config'
import GuestHub from '@/components/guest/GuestHub'

export default async function HubPage({ params }: { params: Promise<{ property: string }> }) {
  const { property } = await params
  const prop = PROPERTIES[property]
  if (!prop) notFound()

  /*  Contact details come from the environment and are passed down rather than
   *  hardcoded. A blank stays blank: the hub hides a channel it has no address
   *  for instead of printing a placeholder a guest might actually try. */
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
