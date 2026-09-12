# Legacy retirement checklist

44 `/admin` pages. This tracks what each needs before it can go, so progress is
visible and nothing is stranded.

**Nothing is deleted, ever — redirects only.** A redirect keeps bookmarks, pasted
links and browser history working. Deleting 404s them for no gain, and for the
28 legacy-only pages it would remove the only implementation of a capability.

## State, 9 September 2026

| state | count | change |
|---|---|---|
| Redirected (earlier) | 5 | haussy, income, invoices, mat-return, property-management/finance |
| **Redirected (this session)** | **8** | the migrated set below |
| Legacy-only — no equivalent | 28 | untouched |
| Awaiting a destination | 2 | `/admin`, `/admin/bookings` |
| Blocked by held files | 0 | **was 1** — toronto-mat, unblocked when the tax files landed |

### The 8 redirected this session

`bookings/[id]` · `bookings/block/[id]` · `calendar` · `concierge` ·
`door-activity` · `system-log` · `guests` · `guests/[id]`

Each had a proven working equivalent. Verified in the deploy tarball and in
production.

## A CORRECTION TO THE FIRST AUDIT

The readiness report listed **`/admin/bookings` → `/keyholder/stays`** as
*migrated*. **It was not.** `/keyholder/stays` was a twenty-line stub whose whole
content was a calendar link and the sentence "Bookings, guests and parking are
still on the legacy admin."

The mistake was reading a **page that exists at the path a migrated page would
occupy** as evidence of migration. Route shape is not capability. Both back-links
into legacy were truthful signposts, not stale pointers — which is why the two
redirects were correctly held back, though for the wrong stated reason ("loop"
rather than "the destination does not exist").

**The stays list has since been built** (`ab46d10`), so that entry is now real.
`/keyholder/property` remains a stub and its `/admin` link stays until 3a.

**The correction means one more build than the original table implied.**

## Remaining work, in order

1. ~~**Build the stays list**~~ — done, `ab46d10`. Awaiting confirmation that it
   covers what `/admin/bookings` is used for, then that back-link severs and the
   redirect follows.
2. **Build `/keyholder/property`** — the genuine hole. `properties`,
   `properties/[id]`, `photos`, `pricing` have no equivalent at all. Until then
   `/keyholder/property` honestly points at `/admin`.
3. **Coverage checks for money, guests, property, locks, tax** — the same
   20-capability check done for booking/stay. **Coverage in those areas is
   UNKNOWN, not complete.** Retire nothing there until its check clears.

## The property editor landed — 11 September 2026

`/keyholder/property` is a real page now, not a signpost. Content and Places were
built (`fdb1a3c`), Pricing was already there, and **three more legacy pages
redirect**:

`properties` → `/keyholder/property` · `properties/[id]` →
`/keyholder/property/[id]` · `properties/[id]/pricing` →
`/keyholder/property/[id]/pricing`

**`properties/[id]/photos` IS DELIBERATELY NOT REDIRECTED.** The Photos tab has
not been built, so that page is still the only place photo management exists.
Redirecting it would 404 a real capability rather than migrate one — the same
error as the original audit, which read a route that existed as a migration that
had happened.

So the broad "everything else is on the legacy admin" link is gone — it stopped
being true — and a **narrow per-property `Photos ↗` link** replaces it, pointing
at exactly one page and saying what is behind it. The legacy DASHBOARD is no
longer a destination from anywhere in the new shell.

### NEXT — the Photos tab

Wrap the existing `PhotoManager` in keyholder chrome, then sever the last photos
link and redirect `/admin/properties/[id]/photos`. **This is what closes the
editor COMPLETELY and gets fully off the legacy property pages.** Its own piece;
the narrow Photos link is the honest bridge until it is built.

## The 28 legacy-only pages

Backed by a real table — losing these loses the capability:

`contacts` · `damage` · `damage/new` · `newsletter` · `reviews` · `settings` ·
`bookings/new`

No backing table — UI, config or stub, still the only place it exists:

`inventory` · `knowledge` · `locks` · `parking` · `security` · `staff-access` ·
`tasks` · `users` · `inbox` · `mat` · `bookings/import` · `guests/new` ·
`properties` · `properties/[id]` · `properties/[id]/photos` ·
`properties/[id]/pricing` · `property-management` ·
`property-management/supplies` · `property-management/trips` · `access`

`/admin/toronto-mat` stays live: redundant with `/keyholder/money/tax` now that
both honour `apply_tax` identically, but it is a **different report shape**
(per-platform filters). Confirm the new one covers that in the tax coverage check
before redirecting.

## DECIDED — do not rediscover

**Three 2025 VRBO stays are deliberately logged-not-enriched:** 14 Aug, 21 Aug and
26 Dec 2025. They carry feed uids, so they are real reservations that never had
figures entered. Katherine's decision, 9 September 2026: **leave them.**

- They stay **visible** in `/keyholder/stays`, amber, "needs figures".
- They are **excluded from every money surface** — P&L, income, both MAT reports —
  which all filter `is_booking = true`. Verified against the data: zero overlap.
- They are **excluded from occupancy**, so occupancy is very slightly understated:
  five stays across two years. The right trade against inventing revenue.

A future session should not surface these as an anomaly and ask again.

**The occupancy exclusion holds by a narrow condition, not by design** — see the
comment at the `offMarket` filter in `app/api/admin/occupancy/route.ts`. Widening
that predicate would silently start counting their null nights.
