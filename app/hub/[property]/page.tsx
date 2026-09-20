import { notFound } from 'next/navigation'
import { siteConfig } from '@/lib/site-config'
import { loadProperty } from '@/lib/properties-db'
import { hubContext } from '@/lib/guest/hub-context'
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

  /*  BOOKING CONTEXT, OR NOTHING AT ALL.
   *
   *  hubContext compares the cookie's SIGNED property id against this route
   *  before it runs a single query, so a valid session for another property is
   *  indistinguishable from no session here — and costs no database read either.
   *
   *  When it comes back unverified, `stay` is undefined and every booking-shaped
   *  field below is simply absent from the props. Not blanked, not hidden behind
   *  a flag the client checks: absent. Next serialises every field of an object
   *  passed to a client component whether or not anything renders it, which is
   *  exactly how an address once travelled to a public page no component
   *  displayed it on. The only reliable way to keep a thing out of the bytes is
   *  to never put it in. */
  const ctx = await hubContext(property)
  const stay = ctx.verified ? {
    guestName: ctx.booking.guest_name,
    checkIn: ctx.booking.check_in,
    checkOut: ctx.booking.check_out,
  } : undefined

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
      {...(stay ? { stay } : {})}
    />
  )
}
