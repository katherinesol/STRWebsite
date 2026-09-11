/*  Does the seeded table reproduce lib/properties.ts EXACTLY?
 *
 *  Nothing may read the table until this prints zero differences. The public
 *  property pages and the guest hub are live and sending guests to Houfy; a
 *  description that migrated with a missing character, or a POI array that lost
 *  its last entry, would render on a page a guest is reading right now.
 *
 *  Deep equality, not a spot check: arrays and objects are compared by value,
 *  because "6 POIs both sides" is not the same claim as "the same 6 POIs". */
import { PROPERTIES } from '../../lib/properties'

const env = Object.fromEntries(
  require('fs').readFileSync('.env.local', 'utf8').split('\n')
    .filter((l: string) => l.includes('=') && !l.startsWith('#'))
    .map((l: string) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const U = env['NEXT_PUBLIC_SUPABASE_URL'], K = env['SUPABASE_SERVICE_ROLE_KEY']

const FIELDS: [string, (p: any) => unknown][] = [
  ['name', p => p.name], ['neighbourhood', p => p.neighbourhood], ['city', p => p.city],
  ['address', p => p.address ?? null], ['tagline', p => p.tagline],
  ['description', p => p.description], ['area_description', p => p.areaDescription],
  ['beds', p => p.beds], ['baths', p => p.baths], ['max_guests', p => p.guests],
  ['sqft', p => p.sqft ?? null], ['check_in', p => p.checkIn], ['check_out', p => p.checkOut],
  ['min_stay', p => p.minStay], ['amenities', p => p.amenities], ['highlights', p => p.highlights],
  ['house_rules', p => p.houseRules], ['faq', p => p.faq], ['pois', p => p.pois ?? []],
  ['houfy_url', p => p.houfyUrl ?? null], ['airbnb_url', p => p.airbnbUrl ?? null],
  ['vrbo_url', p => p.vrboUrl ?? null], ['parking_spots', p => p.parkingSpots],
  ['early_checkin_available', p => p.earlyCheckinAvailable],
  ['earliest_checkin_time', p => p.earliestCheckinTime],
  ['latest_checkout_time', p => p.latestCheckoutTime],
  ['bag_drop_available', p => p.bagDropAvailable],
  ['instacart_available', p => p.instacartAvailable],
  ['instacart_cutoff_hours', p => p.instacartCutoffHours],
  ['security_deposit', p => p.securityDeposit],
  ['str_registration', p => p.strRegistration ?? null],
  ['cancellation_policy', p => p.cancellationPolicy],
  ['map_offset', p => p.mapOffset ?? null],
]

/*  Key order is NOT a difference. Postgres jsonb stores object keys in its own
 *  normalised order — shortest first, then bytewise — so {q,a} comes back as
 *  {a,q}. A plain JSON.stringify comparison calls that a mismatch and reports six
 *  differences in data that is byte-identical by value. Sort keys at every depth
 *  before comparing, so this tests the content and not Postgres's storage order.
 *
 *  ARRAY ORDER IS STILL A DIFFERENCE, and deliberately: the POI list renders
 *  nearest-first and the FAQ reads top to bottom, so a reordered array is a real
 *  regression even though the same items are present. */
const sortKeys = (v: any): any =>
  Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]))
  : v
const norm = (v: unknown) => (typeof v === 'number' ? v : JSON.stringify(sortKeys(v ?? null)))

async function main() {
  const res = await fetch(`${U}/rest/v1/properties?select=*`, {
    headers: { apikey: K, Authorization: `Bearer ${K}` },
  })
  const rows: any[] = await res.json()
  const byId = Object.fromEntries(rows.map(r => [r.id, r]))

  let diffs = 0, checked = 0
  for (const p of Object.values(PROPERTIES) as any[]) {
    const row = byId[p.id]
    if (!row) { console.log(`  ✗ ${p.id}: NO ROW IN TABLE`); diffs++; continue }
    for (const [col, get] of FIELDS) {
      checked++
      const want = get(p), got = row[col]
      if (norm(want) !== norm(got)) {
        diffs++
        console.log(`  ✗ ${p.id}.${col}`)
        console.log(`      file : ${JSON.stringify(want)?.slice(0, 150)}`)
        console.log(`      table: ${JSON.stringify(got)?.slice(0, 150)}`)
      }
    }
  }
  console.log(`\n  ${Object.keys(PROPERTIES).length} properties x ${FIELDS.length} fields = ${checked} comparisons`)
  console.log(`  differences: ${diffs}`)
  console.log(diffs === 0
    ? '\n  ZERO DIFFERENCES — the table reproduces the file exactly. Safe to switch a reader.'
    : '\n  *** DO NOT SWITCH ANY READER ***')
  process.exit(diffs === 0 ? 0 : 1)
}
main()
