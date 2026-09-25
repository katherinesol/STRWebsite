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

### The Photos tab landed — the editor is COMPLETE

`PhotoManager` moved onto the keyholder palette and now serves
`/keyholder/property/[id]/photos`. It was restyled in place rather than forked:
once the legacy page redirected, it had exactly one caller, and a second copy
would be two things to fix the day an upload bug appears. Every line of
behaviour is unchanged — same four routes, same optimistic updates, same drag
handling.

**All four `/admin/properties*` pages now redirect.** The narrow `Photos ↗`
bridge is gone with them; the tab it was waiting for exists. Nothing about a
property is edited on the legacy admin any more, and **no page in the new shell
links out to a legacy page at all.**

Photo counts as this landed: Royal York West 8, **Nickel Beach 1**, Royal York
East 0. The flagship at $880 a night having a single photo is now a thing
Katherine can fix without opening the old admin.

## THE AUDIT METHOD WAS WRONG — corrected 20 September 2026

The coverage audit measured **routes called**, not **capabilities offered**, and
that is not the same question. A route can be referenced from the new shell while
the use of it that mattered stays behind — same endpoint, two different jobs.

This is the security pass's lesson in a new dimension. That one learned *per
handler, not per file*. This is *per capability, not per route*. The blind spot
for zero-API pages was already written down here; the adjacent version of it was
not, and two pages were wrongly cleared because of it.

### Reclassified — neither was safe

**`/admin/parking` → BUILD FIRST.** `ParkingControl` is mounted in the new
shell's stay page, so the route is reached, and the audit called that covered.
But the two surfaces do different jobs: the component is a per-stay toggle that
calls `overview=1` and then keeps only its own row —
`find(a => a.booking_id === bookingId)` — while `/admin/parking` is a **driveway
week-view rota** with paging across all bookings. One answers "may this guest
have a lane"; the other answers "who has a lane on Thursday". No week view exists
in the new shell. It also returns null for anything that is not Royal York.

**`/admin/property-management` → BLOCKED.** It was called "a hub of links with no
capability of its own". Its capability IS the navigation: it is the only way in
to `supplies` (3 rows) and `trips` (1 row). Redirect it and both are reachable by
typed URL and nothing else. It unblocks the moment those two have a home or are
retired — and both sit in Katherine's decision pile, so this may cost no build at
all.

**`/admin/mat` stays retired.** It was settled by comparing the two
COMPUTATIONS line by line, not by counting routes, so it does not carry this
flaw.

## RE-AUDIT OF THE ALREADY-REDIRECTED PAGES — three live gaps

Because the flawed method also classified the pages that have already gone, all
19 were re-checked with the corrected one: each page's PRE-REDIRECT content was
recovered from git and compared against what its target actually reaches.

Fourteen showed a difference; most are renamed equivalents (`BookingEditForm`
became `BookingDetail`, and so on) and were dismissed by hand. **Three are real,
and they shipped.**

### 1. House-guide upload had no home — ~~GAP~~ **CLOSED 21 Sep, `ba5034a`**

A fifth editor tab, `/keyholder/property/[id]/guides`, mounts GuideUpload with a
property. Chrome and a mount, not a rebuild — the upload logic including the
two-step signed-URL flow is untouched, and `/api/admin/guest-guide` already
required `property:edit` on both write verbs. The component is no longer
orphaned; the guard checks that by walking every file for an importer rather
than trusting the diff.

The bucket still holds one file — `royal-york-east-guide.pdf`, for the property
not taking bookings. **Nickel Beach and Royal York West remain without a guide**,
and that is now content rather than capability.

The original finding, kept because the shape of it is the lesson:

`components/admin/GuideUpload.tsx` still exists and **no page imports it**. It
was mounted on `/admin/properties`, which redirects to `/keyholder/property`, and
the new property editor has Content, Places, Photos and Pricing — **no Guides
tab**. The API routes are all still live: `/api/admin/guides`,
`/api/admin/guides/[id]`, `/api/admin/guest-guide`.

This one bites twice. The missing house guides for Nickel Beach and Royal York
West are already on the content list as something Katherine owes — and she
currently **cannot upload one through the new shell at all**. The escalation
analysis in `guest-surface.md` argued those guides would pre-empt most guest
questions. The tool to add them was redirected away.

### 2. Invoice export — OPEN, small, nobody blocked

`/api/admin/invoices/export` is called by nothing in `/keyholder`. The route
still exists and works; there is no button. It was on the legacy invoices page,
which redirects to `/keyholder/money/invoices`.

**Scope:** one export button on the invoices surface, calling the route that is
already there. No new endpoint, no new permission — the route carries its own
gate. Half an hour, and it restores a capability rather than adding one.

### 3. Property settings — OPEN, eight columns, nobody blocked

`PropertySettingsForm` is mounted nowhere in the new shell. Thirteen
`property_settings` columns lost their editor, and the thirteen split cleanly:

**FIVE ARE DELIBERATE AND MUST STAY READ-ONLY** — `nightly_rate`,
`cleaning_fee`, `min_stay`, `earliest_checkin`, `latest_checkout`. Each lives in
more than one table and the copies already disagree; the Content tab shows them
with a pointer to Pricing and refuses to write them, on purpose. Reconciling the
three tables is its own pass and this is not it.

**EIGHT WERE SIMPLY LEFT BEHIND:**

| column | what it governs |
|---|---|
| `max_advance_days` | how far ahead a booking may be taken |
| `early_checkin_fee_per_hour` | what an early arrival costs |
| `late_checkout_fee_per_hour` | what a late departure costs |
| `referral_reward_referrer` | what a referring guest gets |
| `referral_reward_referred` | what the referred guest gets |
| `schlage_devices` | which locks belong to this property |
| `cleaning_duration_mins` | how long a turnover takes |
| `security_deposit_amount` | the deposit held |

**Scope:** a section on the Content tab, or a sixth tab if it reads better
beside the other settings. It needs adding to `CONTENT_FIELDS` in
`lib/keyholder/property-edit.ts`, which is already allowlisted and validated, so
the write path exists — this is a form and eight entries in an array.

**One to treat carefully:** `schlage_devices` is JSON naming physical locks, and
`property_locks` is the table the queue actually serialises on. A free-text
editor over it could disagree with the locks the worker knows about. Worth
reading how the two relate before exposing it, rather than shipping a box.

**Two smaller ones, noted not flagged:** `/api/admin/knowledge` is unreachable
from the redirected concierge page but `/admin/knowledge` still exists as a
legacy page, so the capability is reachable, just not from where it was.
`/api/admin/haussy/create-booking` is unreachable from `/keyholder/assistant` —
worth a look, but the assistant has other booking paths.

**Checked and cleared:** `/api/admin/occupancy` (reached via `MonthGrid`),
`UpcomingPayments` (mounted on the invoices page), and the nine
component-rename cases.

## CAPABILITY COVERAGE — audited 20 September 2026, all four areas

The other half of the coverage checks. Security was audited the same day and is
recorded in BACKLOG.md; this is "what would be stranded if the page went away".

**Method: per CAPABILITY, not per page.** A page is mapped to the API routes it
and its component tree call, and a route no `/keyholder` page calls is
legacy-only. That is grep-certain — the route is either referenced from the new
shell or it is not.

**The method has a blind spot, and it matters if this is re-run.** A page with no
API calls at all — server-rendered, reading Supabase directly — comes back with
zero legacy-only routes, which reads identically to "fully covered". `damage` and
`property-management` are both that shape and were hand-inspected. Any future run
must treat "0 routes used" as *unmeasured*, not as *clean*.

### RETIRE NOW — safe, zero loss

| page | evidence |
|---|---|
| ~~`/admin/parking`~~ | **RECLASSIFIED — build first.** The route is reached; the week-view rota is not. See the correction above. |
| ~~`/admin/property-management`~~ | **RECLASSIFIED — blocked.** It is the only navigation into supplies and trips. |
| `/admin/mat` | **redirected 20 Sep** — `/keyholder/money/tax` is a strict superset, settled by comparing computations rather than counting routes |

### KATHERINE'S DECISION — the table is empty, so nothing would be missed

Each of these guards a capability that exists and **has never been used**. The
question is not technical. It is whether she intends to start using it.

| page | table | rows |
|---|---|---|
| `damage`, `damage/new` | `damage_reports` | **0** |
| `newsletter` | `newsletter_subscribers` | **0** |
| `contacts` | `contacts` | **0** |
| `reviews` | `reviews` | **0** |
| `access` | `access_codes` | **0** |

Note damage MONEY is already migrated — `damage_recovery` is an income kind on
the P&L. It is damage REPORTS that are unused, which is a different thing.

### BUILD FIRST — genuine blockers, in order

1. **`/admin/locks` — the largest remaining build.** The only home for
   `set-code`, which writes a door code, and `locks/sweep`, the morning check.
   Six `property_locks`, thirty `lock_actions` — live, load-bearing machinery.
   `/keyholder/access` shows door ACTIVITY and the system log; it does not
   OPERATE locks. Needs a lock-operation surface before this page can go.
2. **`/admin/security`** — 2FA and passkey registration for the team's own
   accounts. Not a guest feature and not migrated; retiring it means nobody can
   register a passkey.
3. **`/admin/toronto-mat`** — the only surface that RECORDS a filing, and
   `mat_filings` has one row, so it is a real record rather than a theoretical
   one. Also carries Toronto's rate-by-date rule, 8.5% to 31 July 2026 then 6%.
4. Smaller: `/admin/staff-access` (1 row), `/admin/guests/new` (the only manual
   guest creation — everything else arrives by booking or platform sync),
   `property-management/supplies` (3 rows) and `/trips` (1 row).

### SETTLED — `/admin/mat` redirects

**The reason is superset, not agreement.** The two reports DO produce the same
figures today, and that is the weaker argument: nothing in the current data
exercises the places they differ. Every Nickel Beach booking has `apply_tax`
true, none runs to thirty nights, none is direct. The divergence is latent, not
absent — it would appear on the first thirty-night stay, the first direct
booking, or any Toronto property.

What makes it safe is that `mat-return` does everything `mat-report` did, and
does three things correctly that `mat-report` did wrongly:

| | `/admin/mat` (`mat-report`) | `/keyholder/money/tax` (`mat-return`) |
|---|---|---|
| MAT rate | `const RATE = 0.04` — Port Colborne's, hardcoded | `matRate(property, date)` — carries Toronto 8.5% → 6% |
| `apply_tax` | never selected; a reimbursement would be billed MAT | `resolveApplyTax(...)` |
| exemption | `total > 29`, hardcoded | `matExempt(property, nights)` |
| property | hardcoded `'nickel-beach'` | parameterised |
| platform | `IN (airbnb, vrbo, houfy)` | no filter |

The hardcoded rate is why the old page was pinned to one property: it could not
produce a correct Toronto figure. The nineteen Royal York West bookings were
invisible to it.

**One UI difference, and it is not a capability loss:** the new tab has a
property selector, so Nickel Beach is chosen rather than assumed.

**THE CAVEAT, RECORDED HONESTLY.** This was settled by a STATIC diff — the two
computations read side by side, plus a data check for where they would diverge.
It was NOT a runtime JSON diff: both endpoints need an authenticated session, and
replicating a hundred lines of apportionment logic in a harness risks a copy
error producing a false result. The static case is strong because it is a
superset by construction rather than by comparison. If Katherine wants certainty,
the one-time runtime check is to sign in and open both pages on the same quarter
before the old one stops answering.

### Where that leaves the count

0 retire now — all three resolved: one redirected, two reclassified.
6 waiting on a decision, 10 waiting on a build, 0 unknown.
Plus **3 live gaps already shipped** — see the re-audit above.

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

## `/admin/locks` retired — 24 September 2026, `0c72e3c`

The largest remaining build, and the last home of `set-code`. Replaced by
`/keyholder/access/locks`: heartbeat, batteries, arrivals, pending intents and
the lock roster, with no Seam anywhere in it.

**Seam was dead in both directions.** Its API key answers 401 and its webhook
stopped delivering on 23 September — 25 door openings after that date were
recorded by the worker and none by Seam. `locks/status`, `locks/discover`,
`webhooks/seam` and `lib/seam.ts` are deleted; the sweep and the cron were the
last callers and both now use the queue. Losing the webhook trades real-time
push for poll-at-run, taken deliberately.

**Two desync guards, because the queue snapshots a device id.**
`queue_lock_action` denormalises `schlage_device_id` onto the intent and the
worker groups on that copy, never re-resolving through `property_locks`.

- `lock_actions.lock_id` is `ON DELETE RESTRICT`. It CASCADED, so deleting a
  lock silently deleted its pending intents — no failed row, no alert, first
  symptom somebody at a door.
- `schlage_device_id`, `seam_device_id` and `property_id` are frozen while that
  lock has work queued.

### KNOWN GAP — Royal Side is two rows and the guard is per row

East and West share the side entrance: one physical lock, two `property_locks`
rows. The constraint counts intents **per row**, so the West row is protected
(16 recorded actions) while the East row has none and is FK-safe to delete.

Deleting it corrupts no queue. It stops East bookings queueing a door East
guests walk through, and nothing surfaces that until someone cannot get in.

**The UI's shared-device warning is the only guard there.** A database cannot
see that two rows are one lock — the relationship is a `schlage_device_id` they
happen to share, which is also why the worker serialises on the device rather
than the row. Not closable in Postgres without modelling the physical lock as
its own table, which is a bigger change than the risk warrants today.
