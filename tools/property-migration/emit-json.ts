/*  The same seed as JSON, for insertion through the service-role client.
 *
 *  The SQL-editor route reported "Success. No rows returned" twice while the
 *  table stayed empty — a message that cannot be reconciled with a count of
 *  zero, so the message was wrong. PostgREST returns the actual Postgres error
 *  and the client raises it, which is the only way to see what is really
 *  happening. It also removes SQL string-escaping from the picture entirely:
 *  no apostrophe in "don't" or "we'll" can break a JSON value. */
import { PROPERTIES } from '../../lib/properties'

console.log(JSON.stringify(Object.values(PROPERTIES).map(p => ({
  id: p.id, name: p.name, neighbourhood: p.neighbourhood, city: p.city,
  address: p.address ?? null, tagline: p.tagline, description: p.description,
  area_description: p.areaDescription,
  beds: p.beds, baths: p.baths, max_guests: p.guests, sqft: p.sqft ?? null,
  check_in: p.checkIn, check_out: p.checkOut, min_stay: p.minStay,
  amenities: p.amenities, highlights: p.highlights, house_rules: p.houseRules,
  faq: p.faq, pois: p.pois ?? [],
  houfy_url: p.houfyUrl ?? null, airbnb_url: p.airbnbUrl ?? null, vrbo_url: p.vrboUrl ?? null,
  parking_spots: p.parkingSpots,
  early_checkin_available: p.earlyCheckinAvailable,
  earliest_checkin_time: p.earliestCheckinTime,
  latest_checkout_time: p.latestCheckoutTime,
  bag_drop_available: p.bagDropAvailable,
  instacart_available: p.instacartAvailable,
  instacart_cutoff_hours: p.instacartCutoffHours,
  security_deposit: p.securityDeposit,
  str_registration: p.strRegistration ?? null,
  cancellation_policy: p.cancellationPolicy,
  map_offset: p.mapOffset ?? null,
})), null, 0))
