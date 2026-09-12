/*  What the property editor may write, and what a place has to look like.
 *
 *  This endpoint is unlike the others already allowlisted: what it writes is
 *  READ BY GUESTS, immediately, on three surfaces. A bad value here is not a
 *  broken admin screen, it is a wrong house rule on a live listing. So the
 *  allowlist is the floor, not the ceiling — the POI array gets validated
 *  entry by entry on top of it.
 *
 *  THREE FIELDS ARE DELIBERATELY ABSENT from the allowlist and their absence is
 *  the feature: min_stay, check_in and check_out. Each lives in THREE tables —
 *  properties, property_settings and property_pricing — and they already
 *  disagree. An editor that wrote one of the three would make the disagreement
 *  worse while looking like it had fixed it. They are shown read-only with a
 *  pointer to Pricing, and the reconciliation is its own pass. Cleaning is the
 *  same story with an extra wrinkle: it is per-platform in practice (430 Airbnb,
 *  340 VRBO, 299 Houfy on Nickel Beach) so a single column cannot express it.
 *
 *  id, updated_at and updated_by are absent for the ordinary reason: the first
 *  is the key the WHERE clause pins, and the last two are the server's to say. */

import { CATEGORIES, isCategory } from '@/lib/poi-categories'

export const CONTENT_FIELDS = [
  'name', 'neighbourhood', 'city', 'tagline', 'description', 'area_description',
  'beds', 'baths', 'max_guests', 'sqft',
  'amenities', 'highlights', 'house_rules', 'faq',
  'houfy_url', 'airbnb_url', 'vrbo_url',
  'parking_spots', 'security_deposit', 'str_registration', 'cancellation_policy',
  'early_checkin_available', 'earliest_checkin_time', 'latest_checkout_time',
  'bag_drop_available', 'instacart_available', 'instacart_cutoff_hours',
  'address', 'map_offset', 'pois',
] as const

export type PoiIssue = { index: number; field: string; problem: string }
export type PoiWarning = { index: number; name: string; problem: string }

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const posInt = (v: unknown) => finite(v) && Number.isInteger(v) && v > 0

/*  WHOLE ARRAY OR NOTHING.
 *
 *  The temptation is to drop the bad entries and save the rest, and it is the
 *  wrong call every time. Katherine moves six pins, one has a typo in its
 *  longitude, and a silent strip saves five — she sees "saved", the sixth pin is
 *  gone, and nothing says so. The fallback in properties-db protects a NULL
 *  column by serving the file; it cannot protect a valid array with one
 *  malformed member, because that array IS valid JSON and will be served
 *  happily. So the refusal has to happen here, before the write. */
export function validatePois(input: unknown): { ok: true; pois: any[] } | { ok: false; issues: PoiIssue[] } {
  if (!Array.isArray(input)) {
    return { ok: false, issues: [{ index: -1, field: 'pois', problem: 'must be a list of places' }] }
  }
  const issues: PoiIssue[] = []
  const seen = new Set<string>()

  input.forEach((p: any, i: number) => {
    const at = (field: string, problem: string) => issues.push({ index: i, field, problem })
    if (!p || typeof p !== 'object' || Array.isArray(p)) return at('(entry)', 'is not a place')

    if (typeof p.name !== 'string' || !p.name.trim()) at('name', 'needs a name')
    if (!isCategory(p.category)) at('category', `must be one of ${CATEGORIES.join(', ')}`)

    if (!finite(p.lat)) at('lat', 'needs a latitude')
    else if (p.lat < -90 || p.lat > 90) at('lat', 'must be between −90 and 90')

    if (!finite(p.lng)) at('lng', 'needs a longitude')
    else if (p.lng < -180 || p.lng > 180) at('lng', 'must be between −180 and 180')

    for (const k of ['walkMins', 'driveMins', 'transitMins']) {
      if (p[k] == null) continue
      if (!posInt(p[k])) at(k, 'must be a whole number of minutes above zero, or left empty')
    }

    const id = typeof p.id === 'string' ? p.id.trim() : ''
    if (id && seen.has(id)) at('id', `duplicated — "${id}" is already used`)
    if (id) seen.add(id)
  })

  if (issues.length) return { ok: false, issues }

  /*  Nearest first, walk before drive — the order the guest map already uses, so
   *  the editor list and the listing cannot drift apart. A place with neither
   *  time sorts last rather than first: no time means unknown, not zero. */
  const rank = (p: any) => finite(p.walkMins) ? p.walkMins
    : finite(p.driveMins) ? 1000 + p.driveMins
    : finite(p.transitMins) ? 2000 + p.transitMins : 9999

  const pois = input
    .map((p: any, i: number) => ({
      id: (typeof p.id === 'string' && p.id.trim()) || `poi-${i + 1}-${String(p.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
      name: String(p.name).trim(),
      category: p.category,
      lat: p.lat, lng: p.lng,
      ...(p.walkMins != null ? { walkMins: p.walkMins } : {}),
      ...(p.driveMins != null ? { driveMins: p.driveMins } : {}),
      ...(p.transitMins != null ? { transitMins: p.transitMins } : {}),
      ...(p.note ? { note: String(p.note) } : {}),
    }))
    .sort((a, b) => rank(a) - rank(b))

  return { ok: true, pois }
}

/*  A WARNING, NOT A REFUSAL. Eighteen of the existing pins were placed by hand
 *  from memory, and some are wrong — but "wrong" here is a judgement about the
 *  world, not a violation of a rule, and code that cannot tell the difference
 *  should not be the one blocking a save. A place 60km away with a seven-minute
 *  walk is almost certainly a mistyped coordinate; it is also exactly what a
 *  legitimate ferry or a mislabelled region would look like. Flag it, show it,
 *  let her decide. */
const R = 6371
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function poiWarnings(pois: any[], centre?: { lat: number; lng: number } | null): PoiWarning[] {
  if (!centre || !finite(centre.lat) || !finite(centre.lng)) return []
  const out: PoiWarning[] = []
  pois.forEach((p, i) => {
    const km = distanceKm(centre, p)
    if (km > 50 && p.walkMins != null) {
      out.push({ index: i, name: p.name, problem: `${Math.round(km)}km away but claims a ${p.walkMins}-minute walk — check the coordinates` })
    } else if (km > 200) {
      out.push({ index: i, name: p.name, problem: `${Math.round(km)}km from the property — is that right?` })
    }
  })
  return out
}
