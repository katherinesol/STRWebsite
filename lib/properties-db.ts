import { createAdminClient } from '@/lib/supabase/server'
import { PROPERTIES, type Property } from '@/lib/properties'

/*  PROPERTY CONTENT, TABLE FIRST AND FILE AS THE SAFETY NET.
 *
 *  lib/properties.ts is the content the public property pages and the guest hub
 *  render today: descriptions, amenities, house rules, FAQ, and the six POIs per
 *  property. Changing any of it meant editing TypeScript and redeploying. The
 *  `properties` table makes it editable; this is what reads it.
 *
 *  NULL MEANS "USE THE FILE", NEVER "SHOW NOTHING". Every field is taken from the
 *  table only when the table has a real value for it, and falls through to the
 *  file otherwise. That single rule is what makes switching a live reader safe:
 *  the worst a broken, half-filled or entirely missing row can do is render
 *  exactly what the site renders today. A blank description on a page that is
 *  actively sending guests to Houfy is not a failure mode this is willing to have.
 *
 *  A MISSING ROW IS NOT AN ERROR. A property absent from the table falls back
 *  wholesale to the file, which is also what happens if the database is
 *  unreachable — the pages keep working.
 *
 *  EMPTY ARRAY vs NULL is a real distinction and is honoured. `amenities: []`
 *  in the table means "this property genuinely lists no amenities" and wins;
 *  `null` means "not migrated, ask the file". Collapsing the two would make it
 *  impossible to ever clear a list through the editor. */

const has = (v: unknown) => v !== null && v !== undefined

/** Table column → Property field. Only fields the table owns; everything else
 *  (pricing, tax rates, iCal URLs) still comes from the file or its own table. */
function mergeRow(file: Property, row: Record<string, any> | null | undefined): Property {
  if (!row) return file
  const pick = <K extends keyof Property>(col: string, key: K): Partial<Property> =>
    has(row[col]) ? ({ [key]: row[col] } as Partial<Property>) : {}

  return {
    ...file,
    ...pick('name', 'name'),
    ...pick('neighbourhood', 'neighbourhood'),
    ...pick('city', 'city'),
    ...pick('address', 'address'),
    ...pick('tagline', 'tagline'),
    ...pick('description', 'description'),
    ...pick('area_description', 'areaDescription'),
    ...pick('beds', 'beds'),
    ...pick('baths', 'baths'),
    ...pick('max_guests', 'guests'),
    ...pick('sqft', 'sqft'),
    ...pick('check_in', 'checkIn'),
    ...pick('check_out', 'checkOut'),
    ...pick('min_stay', 'minStay'),
    ...pick('amenities', 'amenities'),
    ...pick('highlights', 'highlights'),
    ...pick('house_rules', 'houseRules'),
    ...pick('faq', 'faq'),
    ...pick('pois', 'pois'),
    ...pick('houfy_url', 'houfyUrl'),
    ...pick('airbnb_url', 'airbnbUrl'),
    ...pick('vrbo_url', 'vrboUrl'),
    ...pick('parking_spots', 'parkingSpots'),
    ...pick('early_checkin_available', 'earlyCheckinAvailable'),
    ...pick('earliest_checkin_time', 'earliestCheckinTime'),
    ...pick('latest_checkout_time', 'latestCheckoutTime'),
    ...pick('bag_drop_available', 'bagDropAvailable'),
    ...pick('instacart_available', 'instacartAvailable'),
    ...pick('instacart_cutoff_hours', 'instacartCutoffHours'),
    ...pick('security_deposit', 'securityDeposit'),
    ...pick('str_registration', 'strRegistration'),
    ...pick('cancellation_policy', 'cancellationPolicy'),
    ...pick('map_offset', 'mapOffset'),
  }
}

/** One property, table merged over file. Returns null only if the id is unknown
 *  to BOTH — an id the file has never heard of is a 404, not a fallback. */
export async function loadProperty(id: string): Promise<Property | null> {
  const file = PROPERTIES[id]
  if (!file) return null
  try {
    const { data } = await createAdminClient()
      .from('properties').select('*').eq('id', id).maybeSingle()
    return mergeRow(file, data)
  } catch (e: any) {
    /*  The fallback stays — a database problem must not take a public page down —
     *  but it is NOISY, because a silent one is indistinguishable from working.
     *  This exact hole appeared while proving the fallback: the client threw on
     *  missing env vars, every read fell through to the file, and three test
     *  cases PASSED because "always returns the file" and "falls back correctly"
     *  look identical from outside. A fallback you cannot see firing is a fallback
     *  you cannot trust. */
    console.error('[properties-db] table read failed, serving lib/properties.ts:', e?.message || e)
    return file
  }
}

/** Every property the FILE knows about, each merged with its row if there is one.
 *  Driven by the file so a row that is missing, or an extra row for an id the
 *  file has retired, can neither remove nor invent a property. */
export async function loadAllProperties(): Promise<Property[]> {
  const files = Object.values(PROPERTIES)
  try {
    const { data } = await createAdminClient().from('properties').select('*')
    const byId = Object.fromEntries((data || []).map(r => [r.id, r]))
    return files.map(f => mergeRow(f, byId[f.id]))
  } catch (e: any) {
    console.error('[properties-db] table read failed, serving lib/properties.ts:', e?.message || e)
    return files
  }
}

/*  WHAT THE PUBLIC MAY SEE.
 *
 *  The exact street address was being served on /property/[id] — in the page's
 *  serialized props, not visibly, but one View Source away and indexable. It was
 *  passed to six components and rendered by none, and Next serialises every field
 *  of an object it hands a client component whether anything reads it or not.
 *
 *  The type had carried "given to VERIFIED guests only; never rendered on public
 *  marketing pages" since it was written. The intent was documented and never
 *  enforced, which is the whole lesson: "no component renders it" is not a
 *  security property. Only absence from the payload is.
 *
 *  So this strips at the source rather than trusting the consumer:
 *
 *    address   — the exact house. Booked guests get it through the hub, the
 *                portal and the concierge, which are post-booking surfaces.
 *    icalUrls  — currently empty for every property, stripped anyway: those
 *                fields hold private calendarexport tokens, and the day someone
 *                fills one in is not the day to remember this.
 *
 *  mapOffset STAYS. It is deliberately offset from the real address — roughly
 *  300m — which is the standard host-safety radius and the thing the public map
 *  is supposed to draw. Removing it would break the map to solve a problem it
 *  does not have. */
export function publicProperty(p: Property): Property {
  const { address, icalUrls, ...safe } = p
  return safe as Property
}
