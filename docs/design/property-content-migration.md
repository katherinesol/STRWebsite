# Property content migration — COMPLETE

**Finished 10 September 2026.** All four guest-facing surfaces read the
`properties` table; `lib/properties.ts` is the fallback.

Descriptions, amenities, house rules, FAQ, the six POIs per property, check-in and
check-out times, parking, Houfy URLs — all of it used to require editing
TypeScript and redeploying. It is now a database edit.

## The rule everything rests on

**`null` means "use the file", never "show nothing."** Every field is taken from
the table only when the table has a real value, and falls through otherwise. The
worst a broken, half-filled or entirely missing row can do is render exactly what
the site rendered before — which is what made it safe to switch live public pages
one at a time.

## What reads the table

| surface | checkpoint | proven by |
|---|---|---|
| `/hub/[property]` | CP4 | edit appeared live, nulled field fell back |
| `/property/[id]` | CP5 | identical render, nulled field fell back |
| `/api/guest-support/chat` | CP6 | a rule existing nowhere else reached the answer |
| `/api/portal/booking/[id]` | CP6 | POIs and FAQ |

## Six importers stay on the file, deliberately

- **`property/[id]` `generateStaticParams`** — the set of pages that exist must
  not be something a table row can change. A bad row cannot publish or un-publish.
- **`api/guest/guide`, `api/hub/lead`** — validating that a property id is known.
  The set of valid properties is identity, not content.
- **`api/admin/nickel-wind`, `lib/keyholder/today-env`, `lib/wind-log`** —
  `mapOffset` for a weather lookup, read at **module scope**, which cannot await.
  Not guest content, and each already carries a hardcoded fallback.
- **`lib/properties-db`** — it *is* the fallback.

Eight further importers take only the `Property` or `POI` **type** and receive
their data as props, so there was nothing in them to switch.

## What the verification taught

**Seeds are generated, not transcribed.** `tools/property-migration/emit-json.ts`
imports the module and emits the rows. Three properties of amenities, rules, FAQs
and POIs is exactly the volume where a one-character slip survives review and
surfaces on a live page.

**jsonb normalises key order.** `{q,a}` comes back `{a,q}`. This produced false
mismatches three separate times — in the seed comparator, in a render diff, and in
a POI extraction — and affected the product zero times, because components read
fields by name. The comparator sorts keys at every depth but stays **array-order
sensitive**: POIs render nearest-first and the FAQ reads top to bottom, so a
reordered array is a real regression.

**A silent fallback is indistinguishable from a working read.** The fallback proof
first passed three cases for the wrong reason — the client threw on missing env
vars, every read fell through, and "always returns the file" looks exactly like
"falls back correctly". `properties-db` now logs when it falls back. Silence means
the table is genuinely being read.

**A field-level fallback cannot catch a malformed element.** `pois` is one field,
so an array with five good entries and one missing its coordinates is a valid
non-null value that passes straight through the merge. `NeighbourhoodMap` now
drops entries without usable coordinates and guards `mapOffset`, which was
dereferenced unguarded in three places. Both failure modes were tested by causing
them on the live page.

**Probes need facts that exist in exactly one place.** The concierge proof failed
twice against duplicated facts — check-in is also on the booking, parking is also
in the FAQ — and neither failure was real. A house rule invented for the test
settled it.

## Open, and now fixable

**The 18 POI coordinates are hand-estimated.** Confirmed pre-existing, not caused
by the migration: 42 coordinate values compared against the file, zero
differences. They are plausible and internally consistent with their stated walk
and drive times, but not surveyed, and Katherine reports the pins render in the
wrong places. A data pass of 18 real lookups — now a table edit rather than a
deploy.

**Nickel Beach has no `address`** (both Royal York units do), and **one photo** at
$880/night against Royal York West's eight.

Both are content, and the property editor is what makes them fixable in-app.
