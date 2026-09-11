/*  Proves the fallback bites BEFORE any live reader is switched.
 *
 *  Four cases, because the merge has to be right in both directions:
 *    1. table has a value      → table wins (editing will show up)
 *    2. table field is null    → FILE value returned, never blank
 *    3. property row missing   → whole property falls back to the file
 *    4. table has, file lacks  → table wins (new content is possible)
 *
 *  Case 2 is the one the live pages depend on. Every mutation here is reverted. */
import { PROPERTIES } from '../../lib/properties'

/*  Next.js loads .env.local automatically; a bare tsx script does not, so
 *  createAdminClient() threw and every read fell back to the file — making three
 *  of these cases pass for the wrong reason. Load it before importing anything
 *  that builds a client at module scope. */
const fs = require('fs')
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  if (!line.includes('=') || line.startsWith('#')) continue
  const i = line.indexOf('=')
  process.env[line.slice(0, i).trim()] ||= line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}

const { loadProperty, loadAllProperties } = require('../../lib/properties-db')

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter((l: string) => l.includes('=') && !l.startsWith('#'))
  .map((l: string) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const U = env['NEXT_PUBLIC_SUPABASE_URL'], K = env['SUPABASE_SERVICE_ROLE_KEY']
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }

const patch = (id: string, body: any) =>
  fetch(`${U}/rest/v1/properties?id=eq.${id}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) })
const del = (id: string) => fetch(`${U}/rest/v1/properties?id=eq.${id}`, { method: 'DELETE', headers: H })
const insert = (row: any) =>
  fetch(`${U}/rest/v1/properties`, { method: 'POST', headers: H, body: JSON.stringify([row]) })

const ID = 'royal-york-east'
let fails = 0
const check = (label: string, ok: boolean, detail: string) => {
  if (!ok) fails++
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
  console.log(`      ${detail}`)
}

async function main() {
  const file = PROPERTIES[ID]
  const snapshot = await (await fetch(`${U}/rest/v1/properties?id=eq.${ID}&select=*`, { headers: H })).json()
  const original = snapshot[0]

  console.log('\n═══ 1. TABLE HAS A VALUE → table wins ═══')
  await patch(ID, { description: 'EDITED-IN-TABLE marker' })
  let p = await loadProperty(ID)
  check('an edited description reaches the reader',
    p!.description === 'EDITED-IN-TABLE marker',
    `reader returned: ${JSON.stringify(p!.description).slice(0, 70)}`)

  console.log('\n═══ 2. TABLE FIELD IS NULL → the FILE value, never blank ═══')
  await patch(ID, { description: null })
  p = await loadProperty(ID)
  check('null description falls back to the file',
    p!.description === file.description && !!p!.description,
    `reader returned the file text (${p!.description.length} chars): "${p!.description.slice(0, 62)}…"`)

  console.log('\n═══ 2b. A NULLED ARRAY → the file array, not [] ═══')
  await patch(ID, { pois: null, amenities: null })
  p = await loadProperty(ID)
  check('null pois falls back to the file\'s 6 places',
    JSON.stringify(p!.pois) === JSON.stringify(file.pois) && (p!.pois?.length ?? 0) === 6,
    `reader returned ${p!.pois?.length} POIs, first = ${p!.pois?.[0]?.name}`)
  check('null amenities falls back to the file\'s list',
    JSON.stringify(p!.amenities) === JSON.stringify(file.amenities),
    `reader returned ${p!.amenities.length} amenities, first = ${p!.amenities[0]}`)

  console.log('\n═══ 2c. EMPTY ARRAY is NOT null → table wins, list really is empty ═══')
  await patch(ID, { amenities: [] })
  p = await loadProperty(ID)
  check('an intentionally empty list is honoured',
    Array.isArray(p!.amenities) && p!.amenities.length === 0,
    `reader returned ${p!.amenities.length} amenities — clearing a list through the editor will work`)

  console.log('\n═══ 3. ROW MISSING ENTIRELY → whole property from the file ═══')
  await del(ID)
  p = await loadProperty(ID)
  check('a property with no row still renders',
    p!.description === file.description && p!.name === file.name && (p!.pois?.length ?? 0) === 6,
    `name "${p!.name}", ${p!.pois?.length} POIs, ${p!.amenities.length} amenities — all from the file`)
  const all = await loadAllProperties()
  check('and it is still in the list of all properties',
    all.length === Object.keys(PROPERTIES).length && !!all.find((x: any) => x.id === ID),
    `loadAllProperties returned ${all.length} properties`)

  console.log('\n═══ 4. TABLE HAS WHAT THE FILE LACKS → table wins ═══')
  await insert({ id: ID, address: '999 Table-Only Street', houfy_url: 'https://houfy.com/h/table-only' })
  p = await loadProperty(ID)
  check('a field only the table has is returned',
    p!.address === '999 Table-Only Street' && p!.houfyUrl === 'https://houfy.com/h/table-only',
    `address "${p!.address}" · houfyUrl "${p!.houfyUrl}" (file's houfyUrl is ${JSON.stringify(file.houfyUrl)})`)
  check('while everything else still comes from the file',
    p!.description === file.description && (p!.pois?.length ?? 0) === 6,
    `description and ${p!.pois?.length} POIs intact`)

  console.log('\n═══ RESTORE ═══')
  await del(ID)
  await insert(original)
  const back = await (await fetch(`${U}/rest/v1/properties?id=eq.${ID}&select=*`, { headers: H })).json()
  const restored = back[0]
  const same = ['description', 'amenities', 'pois', 'faq', 'name', 'address']
    .every((k: string) => JSON.stringify(restored[k]) === JSON.stringify(original[k]))
  check('the row is byte-identical to before this test', same,
    same ? 'description, amenities, pois, faq, name and address all match the snapshot' : 'MISMATCH — restore by hand')

  console.log(`\n  ${fails === 0 ? 'ALL CASES PASS — the fallback is safe to rely on.' : `*** ${fails} FAILURE(S) ***`}`)
  process.exit(fails === 0 ? 0 : 1)
}
main()
