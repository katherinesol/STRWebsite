/*  Emits the seed SQL straight from lib/properties.ts.
 *
 *  Hand-transcribing three properties' worth of amenities, house rules, FAQs and
 *  POIs into INSERT statements is exactly the kind of work that produces a
 *  one-character difference nobody notices until a live page renders it. The
 *  module is the source of truth, so the module generates the SQL. */
import { PROPERTIES } from '../../lib/properties'

const q = (v: unknown) =>
  v === undefined || v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`
const j = (v: unknown) =>
  v === undefined || v === null ? 'null' : `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
const n = (v: unknown) => (v === undefined || v === null ? 'null' : String(v))
const b = (v: unknown) => (v === undefined || v === null ? 'null' : v ? 'true' : 'false')

const rows = Object.values(PROPERTIES).map(p => `  (
    ${q(p.id)}, ${q(p.name)}, ${q(p.neighbourhood)}, ${q(p.city)}, ${q(p.address)},
    ${q(p.tagline)}, ${q(p.description)}, ${q(p.areaDescription)},
    ${n(p.beds)}, ${n(p.baths)}, ${n(p.guests)}, ${n(p.sqft)},
    ${q(p.checkIn)}, ${q(p.checkOut)}, ${n(p.minStay)},
    ${j(p.amenities)}, ${j(p.highlights)}, ${j(p.houseRules)}, ${j(p.faq)}, ${j(p.pois ?? [])},
    ${q(p.houfyUrl)}, ${q(p.airbnbUrl)}, ${q(p.vrboUrl)},
    ${n(p.parkingSpots)}, ${b(p.earlyCheckinAvailable)}, ${q(p.earliestCheckinTime)},
    ${q(p.latestCheckoutTime)}, ${b(p.bagDropAvailable)}, ${b(p.instacartAvailable)},
    ${n(p.instacartCutoffHours)}, ${n(p.securityDeposit)}, ${q(p.strRegistration)},
    ${q(p.cancellationPolicy)}, ${j(p.mapOffset)}
  )`).join(',\n')

console.log(`insert into properties (
  id, name, neighbourhood, city, address,
  tagline, description, area_description,
  beds, baths, max_guests, sqft,
  check_in, check_out, min_stay,
  amenities, highlights, house_rules, faq, pois,
  houfy_url, airbnb_url, vrbo_url,
  parking_spots, early_checkin_available, earliest_checkin_time,
  latest_checkout_time, bag_drop_available, instacart_available,
  instacart_cutoff_hours, security_deposit, str_registration,
  cancellation_policy, map_offset
) values
${rows}
on conflict (id) do nothing;`)
