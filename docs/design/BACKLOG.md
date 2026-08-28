# Backlog — the whole of it, both sides

Single source of truth, written 2026-08-25. Assembled by scanning the codebase
itself, [README.md](README.md), [multi-guest.md](multi-guest.md), the
[reconciliation ledger](../reconciliation-2026.md), and the notes left in the
routes. Where a claim here could not be confirmed from code or data it says so.

Two sides share this app. **Part 1** is the admin/host side, which is what has
been built and worked on. **Part 2** is the guest-facing booking product, which
is further along than "spec" in places and hollower than it looks in others.

Status marks in Part 2: **BUILT** works end to end · **PARTIAL** real code, real
gaps · **SHELL** the UI exists but nothing behind it · **SPEC** not started.

---

# PART 1 — ADMIN / HOST

## Silent failures — nothing tells you when these break

| | where | note |
|---|---|---|
| **Lock sweep false alarm** | `app/api/cron/automations/route.ts` | FIXED 2026-08-25, awaiting deploy. Rechecked `on_device` inside Seam's async gap, so every advance booking emailed a failure that was wrong. Now `lib/lock-code-status.ts`, 14 tests. |
| **Sweep blind spot** | same + `app/api/admin/locks/sweep/route.ts` | FIXED, awaiting deploy. `is_booking=true` hid synced reservations; three real arrivals were invisible. |
| **Shared-door misattribution** | `app/api/webhooks/seam/route.ts` | FIXED, awaiting deploy. One device under two properties; RYW guests never matched, and a guest entering via the shared door first got no `checked_in_at`. |
| **Import route** | `app/api/admin/bookings/import/route.ts` | RETIRED 410, awaiting deploy. Never once succeeded. Not repaired deliberately — a working version bypasses the tax engine. |
| **Blanket Nickel Beach skip** | both sweeps | FIXED 2026-08-26. The per-lock + per-platform rule (skip only if the booking is Airbnb **and** that lock is `airbnb_managed`) already existed in all three code paths — `seam.ts:161` and both sweep inner loops — so the blanket line was a special case short-circuiting logic that was already correct. Deleting it was the whole fix. Note Nickel Beach has **one** lock, `Port Colborne`, and it is **not** `airbnb_managed`: there was never an Airbnb-coded door there, which is why Airbnb guests got no code from anyone. |
| **A guest who owes money with no due dates is invisible on Today** | `app/keyholder/page.tsx` overdue predicate | The overdue card requires a due date in the past, so a booking that owes with `second_due_date` and `final_due_date` both null never appears — `unpaid()` says true and the amount is right, but nothing surfaces it. **Alain Roy (RS-1006) owes $4,440.00 this way.** His stay also ended 2026-07-23, before the page's window, so he is doubly invisible. Two separate questions: should an overdue card fire on a booking with no schedule at all, and should the page look further back than the current window for money still owed. Found 2026-08-26 while verifying the comp flag; predates that work and is unrelated to it. |
| **`reprogramBookingWindow` is called once per unhealthy lock** | `automations/route.ts` ~line 141 | It sits **inside** the per-lock loop but **itself loops every lock of the property**, so with two unhealthy locks it runs twice, each pass touching every eligible lock — locks programmed twice per sweep and `reprogrammed` inflated. Not harmful: the second pass updates rather than duplicates, and it never touches an `airbnb_managed` door for an Airbnb booking (guarded in both layers). Hoist it out of the loop. **Own focused change — it touches real lock programming.** Logged 2026-08-26. |
| **Ziyue Jia's code never landed** | Seam, booking 2026-09-04 | `5105` created 2026-07-29, still `on_device=false`. Check directly ~48h before 4 Sep; program by hand if absent. **Open, dated.** |
| **Card bookings take no money** | `app/api/bookings/route.ts:92` | See Part 2. A guest choosing "card" gets `status: 'confirmed'` with nothing charged. **The most serious item in this file.** |

## Shell-migration regressions — worked before the redesign, not after

The pattern: screens were rebuilt against the design doc rather than ported, so
anything not in the doc was dropped. Three found by complaint, one by search.

- **Locks & Access group** — Locks, Door Activity, Staff Access, System Activity
  exist in `components/admin/AdminNav.tsx` and have no equivalent in
  `components/admin/KeyholderNav.tsx`. Reachable only via the `/admin` corner
  link. **Block 2b restores it.**
- **Invoice bank/account picker** — restored 2026-08-24. Convenience only; it did
  not restore reconciliation.
- **Door activity** — never removed, only orphaned. `/admin/door-activity` and
  its API are untouched since `ead01e2`.
- **The full coverage check is Block 2a** — every other AdminNav entry, checked
  against the new shell. Not yet run.

## UI issues — captured 2026-08-25 while reconciling

1. **Early check-in / late checkout cannot be edited, only granted.**
   `GrantsField` writes `early_checkin_granted` / `late_checkout_granted` and
   nothing else; the time is read-only text. Both times are already in the
   `EDITABLE` allowlist on both PATCH endpoints — **the endpoint is finished, only
   the control is missing.** Not the port-BookingActions work. Editing a time
   fires `reprogramBookingWindow`, so the control must say so.
2. **People page has no search or filters.** `app/keyholder/people/page.tsx`
   loads every guest ordered by name into three fixed groups. Worth adding:
   missing-surname and missing-email filters, since a guest with no surname
   cannot verify and one with no email cannot be sent anything.
3. **"asked for 4:00 PM" shows for standard times.** `GrantsField` renders the
   request unconditionally. Prerequisite: **the standard times are declared
   nowhere** — they are implicit in `windowFromBooking` (16:00 / 11:00). They
   should become per-property configuration first.
4. *(A fourth was mentioned but never named — ask.)*

## Invoice and payment logic

- **Three payments have an expense with no link recorded.** `expense_created` is
  true and `expense_id` null on the 2026-08-24 $2,000 billpay, the 2026-08-26
  $249.84 Solid Waste billpay and the 2026-08-26 $1,000 Eureka Kitchen
  e-transfer. **The code that caused it is fixed** (both the mark-paid and
  invoice-panel paths now record which expense, with the same compare-and-swap
  guard the save flow uses), but the three existing rows still cannot clean up
  their expenses on delete, because nothing records which expense each one was.
  Re-linking them means matching on vendor + amount + date, which is exactly the
  attribute match that once deleted a sibling payment's expense — so it wants a
  careful one-at-a-time pass, not a script.
- **`invoice_payments` has no `reference` on the older rows.** The column exists
  now and all four recording paths write it, but the 23 pre-existing payments
  have none. Worth backfilling from bank records at some point; nothing depends
  on it.

## Shipped since this file was written

- **Payment reconciliation, stages 1–4a** (2026-08-26). `bank_accounts` and a
  unified `payments` table; 25 rows migrated with `invoice_payments` byte-identical
  throughout; `expense_created` + `source_payment_id` backfilled; the **Accounts**
  surface live at `/keyholder/money/accounts`; the **Assign** write with its rule
  enforced by a database trigger. Design and stage records in
  [payment-reconciliation.md](payment-reconciliation.md).
- **Free stays** (2026-08-26). `bookings.is_comp` separates a comped stay from an
  unfinished one, so the no-total warning still fires on the second. Guest portal
  no longer shows a comped booking an instalment schedule.
- **Invoice editor, phase 1** (2026-08-26). Identity fields editable through the
  header-only PATCH rather than the full-replace save; a payment reference on all
  four recording paths; one shared tax-rate picker for the new-invoice and edit
  paths. The landmine — that saving identity through `save` would delete the
  invoice's items, payments and their expenses — was proven defused on a real
  invoice in production, items and payments byte-identical across a rename.
- **Lock fixes and the nav restore** (2026-08-25/26). The always-firing sweep
  alarm, the synced-arrivals blind spot, shared-door attribution, the retired
  import route, the blanket Nickel skip, and Locks & Access back in the nav.

## Big builds

- **Payment reconciliation — remaining stages.** 4b (payment-logging UI, account
  mandatory for anything that is not cash) is **blocked on the invoice
  read/write-switch decision**, path (a) switch together or (b) mirror with a
  trigger. The 19-file booking-side switch is separate and larger. Original scope: Platform bookings have no
  payment history, invoice payments have no account, invoice payments have no
  reference: one problem seen three ways. Scoped in [README.md](README.md).
  **Highest-leverage item here** — it is what made this week's 39-booking
  reconciliation manual.
- **Combined P&L.** Wanted eventually; explicitly not part of the Money rebuild.
- **Pre-arrival photo walkthrough — the backend exists and has never been wired.**
  Scoped 2026-08-27 in [photo-walkthrough.md](photo-walkthrough.md), approved as
  design, unbuilt. `booking_media` (booking_id + booking_kind, property_id,
  storage_path, media_type, tag, **captured_at**, added_by) and
  `/api/admin/booking-media` GET/POST/DELETE all exist and are correct.
  **Zero components mount it, zero rows, zero objects in the bucket**, and one
  commit ever touched it — a calendar time-format fix that carried it in as a
  side change. Same shape as `canAddBlocks`: written, never called.
  Three things must be settled before a UI writes anything: **`tag` has no CHECK
  constraint** (`'banana'`, `''` and `'DROP TABLE'` were all accepted on probe,
  as was `media_type='pdf'`); **the POST streams bytes through the route**, which
  is the exact pattern that broke the 9.8MB guide upload and was rewritten to a
  signed URL; and **`captured_at` must come from the file, not the clock**, or
  the timestamp stops meaning what the feature is for. It is also the missing
  half of a damage claim — Heremela's $2,464.57 had no documented pre-arrival
  condition to compare against.
- **TWO mark-deposit-received paths exist until the legacy booking page retires.**
  The redesigned path, `POST /api/admin/bookings/payment`, records a real
  `payments` row on a named account and then stamps the booking — correct, and
  the one to use. The legacy path, `PATCH /api/admin/bookings/[id]` from the old
  booking page, still writes only the timestamp and contains **zero** references
  to the payments table, so it creates a stamp with no ledger row: money that
  shows as received on the booking and does not exist on the Accounts surface.
  It cannot be removed yet — that page is held-file-blocked from retirement by
  the VRBO/Airbnb tax audit. **Checked 2026-08-27: zero orphans exist today.**
  The only stamped instalments are RS-1002's deposit and final, and both have
  ledger rows from the 2026-08-24 backfill; RS-1003, RS-1005 and RS-1006 have no
  stamps at all. Re-check after any spell of using the legacy page.
- **The two reminder senders are dead code, and the diagnosis is narrower than
  "no email provider".** Resend IS wired and working: a real key is set, and
  `sendAccessCode`, `sendPortalSetup`, `sendEscalationAlert` and
  `sendBookingConfirmation` each have a live route, plus the cron's lock alerts.
  What is missing is smaller and specific:
  - `sendPaymentReminder` exists in `lib/email.ts` and has **zero callers and no
    route**. `PaymentReminderForm` POSTs to `/api/admin/bookings/[id]/send-reminder`,
    which **does not exist** — that directory holds only `figures`,
    `send-access-code` and `send-portal-link`. So the form 404s on legacy too.
  - A licence-plate reminder sender **does not exist at all**. `BookingActions`
    sends `{_action: 'send_plate_reminder'}` to the booking PATCH, whose
    allowlist rejects unknown keys, so it 400s. Same for its `{_action:'refund'}`,
    which `CancelOrRefund` has since superseded properly.
  - `newsletter/send` is a stub returning "Email provider not yet connected" —
    which is now inaccurate; the provider is connected, the list and the send are
    what is missing.
  **Do not wire a UI to any of these** — there is nothing behind them. Each needs
  a route plus (for plates) a sender written first. Deferred from the
  booking/stay coverage batch for exactly that reason.
- **Statement matching — rung 1.** Scoped 2026-08-27 in
  [statement-matching.md](statement-matching.md), approved as design, unbuilt.
  Upload a per-account statement, match lines against recorded payments, surface
  the mismatches: a deposit with no payment is unrecorded income (RS-1002
  generalised), a payment with no line is money that never landed. **Proposes
  only — never auto-creates, auto-edits or auto-deletes**, because it is the same
  amount+date matching that once deleted a sibling's expense. Writes
  `bank_statements`, `statement_lines`, and a `reconciled_at` marker on
  `payments` — the bank-confirmed signal Accounts is missing. CSV first with a
  per-account header mapping (the real export headers must be read off a live
  file, not assumed). **Build trigger: Jan–May entered.** Before that, unmatched
  lines are mostly the data gap rather than real findings, and a tool that cries
  wolf gets skimmed.
- **DIRECT BOOKINGS' MAT NEVER REACHES THE MAT RETURN.** `mat-return` and
  `mat-report` read `calendar_blocks` and **have never read the `bookings`
  table** — confirmed by listing every `.from(...)` in both routes. So a direct
  booking's MAT has never appeared in a return. **Harmless today:** all four
  direct bookings (RS-1002, RS-1003, RS-1005, RS-1006) are Nickel Beach with
  `apply_tax = false` and MAT 0, so nothing is currently missing. It becomes real
  the moment a direct booking charges MAT — the return would understate, silently.
  This is a pre-existing gap that predates the reversal work and is the **reason
  the `apply_tax = true` direct-refund guard stays**: reversing MAT against a
  return that never contained it takes a deduction off a figure that was never
  inflated by it, which understates in the other direction. Closing this means
  wiring `bookings` into both routes — apportioned across months the same way
  `calendar_blocks` rows are, with `resolveApplyTax` and the exemption applied.
- **Direct refunds: narrowed guard, not a blanket block** (was
  `direct_refund_unverified`). The reversal arithmetic was verified
  byte-identical to VRBO on every line — no platform split, no Airbnb-MAT flag,
  the whole reversal yours — so the guard is now only about the return the MAT
  lands in. `apply_tax = false` direct refunds are **allowed** (room only, no tax
  anywhere, all four real bookings on this side). `apply_tax = true` direct
  refunds are **refused** with `direct_tax_not_in_mat_return` until the gap above
  is closed. Direct cancellations with no money are unaffected. The rule lives in
  `directRefundGuard` in [refund.ts](../../lib/refund.ts) and is called from both
  refund paths — `/api/admin/refunds` had **no** guard at all until this pass and
  would have written a direct refund with tax on it.
- **Cancellation + refund — stages ② and ③.** Stage ① shipped 2026-08-27: the
  `calendar_blocks.status` migration plus twenty-nine read paths that now skip a
  cancelled row. Recorded in
  [calendar_blocks_status.sql](../../supabase/calendar_blocks_status.sql). Two
  things found during stage ① that stage ② has to carry:
  - ~~**MUST FIX — the unique index blocks cancel-then-rebook.**~~ **FIXED
    2026-08-27** in stage 2: replaced with the partial index
    `calendar_blocks_property_start_live ... where status <> 'cancelled'`.
    Verified: two confirmed rows on one slot still rejected, a cancelled plus a
    confirmed on the same slot allowed. Original note kept below.
  - **MUST FIX — the unique index blocks cancel-then-rebook.** `calendar_blocks`
    carries `unique (property_id, start_date)`, and a cancelled row still
    occupies its slot. So the dates read as free everywhere — availability, the
    iCal feed, the overlap checks all skip it — and then the insert fails on a
    constraint violation. Cancelling to rebook the same property on the same
    check-in date is the whole point of the feature, and without this it fails at
    the database. Fix: replace it with a partial unique index,
    `where status <> 'cancelled'`. Found by a scratch insert during the stage ①
    verification, not by reading the schema.
  - **Possible pre-existing iCal hole — not cancellation-related.** An owner
    block written by [calendar/block](../../app/api/admin/calendar/block/route.ts)
    gets `platform` NULL, and the feed filters with
    `not('platform','in','("airbnb","vrbo","houfy")')`. `NOT IN` never matches
    NULL — it yields NULL, and the row is dropped. If such a block is also
    `reason='manual'` it would never publish, and would never hold the dates on
    Airbnb or VRBO. **Flagged, not asserted:** no row of that shape exists today,
    so it has not been reproduced. Confirm before relying on an owner block to
    hold dates externally.
  - **Toronto MAT refund-netting waits on the audit.** Stage 2 wired refund
    netting into the MAT return, the Nickel MAT report and the assistant's
    quarterly figure. `app/api/admin/toronto-mat-report/route.ts` is held, so it
    alone does not net refunds — a refunded Royal York stay will overstate MAT
    in THAT report until the VRBO/Airbnb audit unholds it. The refund preview
    says so per-booking. Same shape as the cancelled-exclusion, which the same
    file also still lacks.
  - **Direct-booking refunds are built but unexercised.** The engine handles
    `booking_kind = 'direct'`, and direct bookings carry `hst`/`mat` columns the
    reversal does not touch. Only platform refunds have been verified end to
    end.
- **Multi-guest step 3 — per-person access.** Decisions settled (per-person
  tokens, operational-only concierge, lead-can-invite, two-tier window), scoped
  in [multi-guest.md](multi-guest.md), unbuilt. Steps 1–2 shipped.
- **Parking.** `ParkingControl` + `/admin/parking` predate the redesign. Wants a
  real scoping pass, not a restyle: what a record holds, how plates arrive and
  are confirmed, what the guest sees, and how it relates to `vehicle_count` /
  `plate_numbers` / `plates_pending`.
- **Booking-page retirement.** Blocked. Six components mount only on the legacy
  pages: `BookingActions`, `GuestEditCard`, `WindLogCard`, `WaterUsageCard`,
  `BookingSupportCard`, `PaymentReminderForm` — all present under
  `components/admin/`. The held tax files also mount only there. **Cannot retire
  until the VRBO/Airbnb audit unholds them.** Do not redirect these pages.
- **Cistern / wind / water monitoring.** `api/admin/cistern` (+ `usage`),
  `api/admin/nickel-wind`, `api/admin/water-order`, `api/cron/cistern` all exist
  and run. Their UI is `WindLogCard` / `WaterUsageCard` on the legacy page — so
  **the monitoring has no home in the new shell** and is part of the retirement
  blocker above.

## Royal York property model is incomplete — its own piece of work

Recorded 2026-08-26. **Royal York has four units; the system models two.**

**They are not four properties of this business.** Confirmed 2026-08-26:

| unit | entity | status |
|---|---|---|
| Unit 1 — `royal-york-east` | this sole prop | STR. Locks and a listing, but **zero bookings and zero iCal feeds** |
| Unit 2 — `royal-york-west` | this sole prop | STR, fully modelled and actively booked |
| **Unit 3** — below unit 2 | this sole prop | **not rented yet**, no id anywhere. Future STR, to decide |
| **Commercial** — below unit 1 | **a SEPARATE CORP** | **not an STR property here at all** |

### The commercial unit is a different legal entity

It is used by the owner's corporation, which is separate from this sole
proprietorship. **Its revenue must never appear in this P&L** — mixing entities
would be wrong for tax, not merely untidy. Modelling it as a fourth property here
would invite exactly that error.

Its **expenses are this business's**, confirmed 2026-08-26: the owner pays the
commercial unit's improvements personally, so they are sole-prop costs and count
normally. Commercial is therefore **just another `property_id`** — **no exclusion
logic anywhere**, and none should ever be added. The entity boundary is held by
the fact that its income has no path into this system at all, not by a filter
that could be mis-set.

Because of this, revenue for this business is **Nickel Beach + Royal York West
only**, both fully in the system, so nothing is silently missing from a combined
P&L.

Confirmed by reading every table that carries a `property_id`: `calendar_blocks`,
`bookings`, `expenses`, `invoices`, `property_locks`, `ical_feeds`, `supplies`.
Nothing references a third or fourth unit. There is **no `properties` table** at
all — the canonical list is `lib/properties.ts`, with a second, different list in
`lib/property-options.ts` and a third inside `NewInvoiceDialog`.

**This blocks the expense placements.** Costs belonging to unit 3 or the
commercial unit have nowhere correct to go, so the `royal-york` /
`royal-york-both` id cleanup must wait — consolidating first would bury those
rows in a shared bucket they would have to be dug back out of.

### What the work has to answer

- **Are units 3 and commercial rented, and how?** The data cannot say — it can
  only say they are absent. This decides whether they are full properties
  (locks, calendars, iCal feeds, booking capability, guest access) or simply
  attribution buckets for expenses. Note that `royal-york-east` is itself a
  half-case: locks and a listing, but never booked through this system.
- **Commercial may not be a short-term rental at all.** A commercial tenant is a
  lease, not a stay — recurring rent received rather than nightly bookings, and
  probably a different tax treatment. Modelling it as a fourth STR property could
  be wrong in kind, not just in detail.
- **Every place a property id is used** must be reviewed: the three disagreeing
  code lists, `property_locks`, Seam device registration, `ical_feeds`,
  `PROPERTY_NAMES` maps scattered across screens, and the expense/invoice forms.
- **Whether a `properties` table should exist**, so the list stops being three
  hand-maintained arrays that drift — which is what produced the
  `royal-york` / `royal-york-both` split in the first place.

### The P&L dependency

**Resolved 2026-08-26: combined P&L can proceed.** Unit 3 earns nothing yet and
the commercial unit's income belongs to another entity, so the only income this
business has is Nickel Beach and Royal York West — both fully captured. The
remaining gap is non-booking income (damage recoveries and the like), which is
being built as standalone `in` rows on `payments`, not as a property problem.

## Data & reconciliation remaining

- **1 Jan – 15 May 2026 was never entered.** All three properties, all platforms.
  **No 2026 total is trustworthy until it is.** Largest open data item.
- **Host-fee percentage sweep** — every booking against its receipt. A wrong
  percentage means a wrong payout; Josh Klein's was overstated by $533.75.
- **Tudor's $243.54** — tax collected on a refunded night, still in hand. Refund
  the guest or remit the full 738.27. **A decision, not a task.**
- **MAT return treatment** — the credit to confirm at filing.
- **Heremela's $83.32 overpayment — query with Airbnb, do not assume.** Airbnb
  settled **$2,112.27** on damage claim `CLSF-06099978` against a request of
  **$2,028.95** — $83.32 more than was asked for. **This does not change the
  recording**: the money arrived and all three payouts are entered as
  non-booking income (2026-08-26). But an overpayment is money a platform may
  reclaim, and treating a surplus as good news because it is in your favour is
  how it turns into a surprise deduction later. Raise it with Airbnb and get the
  answer in writing. Payout ids `G-O7IFKBHGEBBH4` and `G-NIWJBBSNU6IIT`.
- **Heremela repair costs** — to sit against the $2,464.57 recovered. **Until
  these are entered the P&L shows the recovery as pure gain**, which overstates
  what the stay actually netted.
- **Molhem's VRBO trace** — a note pointing at a booking in the missing months.
- **Per and Mikaela stay at $0 deliberately.** The flag doing its job is the point.

## Parked decisions

- **Heremela's $83.32** — parked on Airbnb's answer, not on ours. Recorded and
  reconciled; the only open question is whether they intended to pay it. See the
  reconciliation list above.

- **VRBO/Airbnb tax audit** — four files held from deploy pending it:
  `TaxToggleField.tsx` (untracked), `BookingEditForm.tsx`,
  `PlatformBookingForm.tsx`, the Q2 `apply_tax` switch in
  `toronto-mat-report/route.ts`. Guarded by `.held/*.sha`.
- **Airbnb's MAT base** — it bills MAT on room+cleaning and excludes MAT from its
  HST base. Flagged on Kristine's row, queued for the same audit.
- **Per-listing tax switch dates** — established, closed, not to be narrowed further.
- **Brand name** — see Part 2.

## Smaller logged items

- `create_booking_full` owes two fixes: no `confirmation_code` (so a direct
  booking made through it has **no guest access at all**) and no
  `first_name`/`last_name`. **v2 is the installed version** — editing the
  unsuffixed file changes nothing.
- **Installed SQL may not match the committed `.sql`.** Verify behaviourally.
- **Email stats** — needs investigation before scoping. Likely two products
  (transactional delivery/bounce vs marketing open/click). Forward-looking only.
- **"Edit in Income →"** in `PlatformBookingForm.tsx` ~376 points at a retired
  screen. Fix when the file is unheld.
- **`/admin/bookings/import` page** still reachable by URL; form now 410s. Clean
  up with the legacy retirement.
- **Guest merge is manual-only, never automatic.**

---

# PART 2 — GUEST-FACING BOOKING PRODUCT

More exists than "mostly unbuilt" suggests: the public property pages, the
booking widget, the checkout and the guest portal are all real. The gap is
concentrated in **taking money** and in the **hold/expiry model**.

## 🚩 LAUNCH BLOCKERS — MUST FIX BEFORE THE GUEST SITE GOES LIVE

Neither is exploitable today: **the guest booking site is not public and no guest
has site access.** So these are not today's work. They are the gate on opening it.
Nothing else in Part 2 ships before both are closed.

> ### 1. ⚠ A card booking is confirmed without charging anything
>
> `app/api/bookings/route.ts:92` — `status: payment_method === 'card' ? 'confirmed' : 'pending_payment'`.
> The checkout offers "Credit / Debit card" and renders a box reading
> **"Stripe payment form loads here"** (`BookingCheckout.tsx:470`). Only the
> Stripe *client* packages are installed; there is no server SDK, no payment
> intent, no webhook, and `SettingsForm.tsx:68` says "coming soon".
> **A guest can complete a card booking, be told they are confirmed, hold the
> dates, and never be charged.** Either wire Stripe or remove the card option
> until it exists.

> ### 2. ⚠ Portal access never expires
>
> `api/portal/booking/[bookingId]` checks only that the caller's email matches the
> guest. There is no `check_out` comparison and no status gate, so **every past
> guest keeps their portal indefinitely** — the local guide, the booking, and the
> Schlage access code that was shown to them near arrival. The spec says the
> portal is active until checkout; the code does not implement that at all.
>
> Fix alongside the code-visibility window, since both turn on the same date.

## Public

| item | status | where / note |
|---|---|---|
| Property listing pages | **BUILT** | `app/property/[id]` — gallery, FAQ, widget composed together |
| Synced availability calendar | **BUILT** | `BookingWidget` → `/api/calendar`, `DateRangePicker` with blocked dates |
| Pricing + fee disclosure | **BUILT** | breakdown incl. "Platform fees $0" |
| Per-property FAQ | **BUILT** | `components/property/PropertyFAQ` |
| Booking widget | **BUILT** | `components/booking/BookingWidget.tsx` |
| Property index | **BUILT** | `components/property/Properties` on the home page. No separate `/properties` route — confirmed, the home page is the index. |
| Public pre-booking FAQ | **PARTIAL** | per-property FAQ exists; a standalone public FAQ does not |
| Home / hero | **BUILT** | `app/page.tsx`, includes reviews |
| Newsletter | **PARTIAL** | admin compose + send exist. **No public signup anywhere** — confirmed absent from the home page, property pages and shared components. Nothing collects an address, so the send tool has only whatever the admin side already holds. |
| Booking confirmation page | **BUILT** | `app/booking/[id]` |

## Booking flow

| item | status | note |
|---|---|---|
| **5% reservation fee, 24h hold, auto-expire** | **SPEC — and the built model differs** | Built is a **10% deposit due today** (`depositPercent: 10` for all three properties). No hold, no expiry, no auto-release. **Decide which model is real before building either.** |
| 50/50 split at 60d / 30d | **BUILT** | `paymentSchedule: { depositPercent: 10, secondPercent: 50, secondDaysBefore: 60, finalDaysBefore: 30 }` |
| 48h payment reminders | **PARTIAL — manual only** | `sendPaymentReminder` exists in `lib/email.ts`; sent by hand via `PaymentReminderForm` on the legacy page. **No cron.** Automating it depends on the retirement blocker. |
| Compressed schedule if booked inside 60d | **SPEC** | no `daysUntil` branch in the checkout |
| Card (Stripe auto) | **SHELL — 🚩 LAUNCH BLOCKER 1** | see the blocker section above |
| E-transfer (manual confirm) | **BUILT** | `pending_payment`, instructions shown, confirmed by hand |
| Status states | **PARTIAL** | `pending` / `pending_payment` / `confirmed` / `completed` in use. **`OVERDUE` does not exist for bookings** — only for tasks. `cancelled` used by the iCal reconcile path. |

## Add-ons

| item | status | note |
|---|---|---|
| Early check-in / late checkout $10/hr | **BUILT** | in checkout and portal |
| Hour bounds | **PARTIAL / conflicting** | spec says noon earliest, 6pm latest; checkout says **"up to 2:00 PM"**. Reconcile. |
| Blocked on same-day turnover + guest message | **SPEC** | turnover detection exists **admin-side only** (`CalendarView`, tight <300min). Nothing blocks an add-on at checkout. |
| Conflict detection vs per-property cleaning duration | **SPEC** | no cleaning-duration field found |
| Free bag drop / Instacart / parking | **BUILT** | `bag_drop`, `instacart_requested`, plates in checkout, booking API and portal |

## Guest portal — `app/portal/[bookingId]`

| item | status | note |
|---|---|---|
| Login-gated | **BUILT** | `/portal/login`, `/portal/auth/callback`, email-matched |
| Booking summary | **BUILT** | |
| Payment schedule + status | **BUILT** | deposit / 50% / final with paid dates |
| FAQ with keyword search | **BUILT** | ≥2-char search across title and content |
| Photos / videos in FAQ | **PARTIAL** | guides are sectioned text; `booking-media` API exists — confirm wiring |
| Schlage code near check-in | **BUILT** | shown within 48h of arrival |
| Local area guide | **BUILT** | `local` tab |
| Damage / lost-item report | **PARTIAL** | `/admin/damage` + API are admin-side; **no guest-side report found in the portal** |
| Active until checkout | **NOT ENFORCED — 🚩 LAUNCH BLOCKER 2** | see the blocker section above |

**Note the overlap:** `/hub/[property]` (GuestHub, house-guide PDF viewer,
concierge, direct-booking capture) is a *second* guest surface built recently.
**Decide whether hub and portal converge** — two guest-facing homes is a
maintenance cost and a confusing story for the guest.

## Trust, growth, compliance

| item | status | note |
|---|---|---|
| ID verification (Stripe Identity) | **PARTIAL** | `id_verified` is a manual flag on guests. No Stripe Identity. |
| Unified reviews (import + direct) | **PARTIAL** | `/admin/reviews` + API exist; home page shows reviews. **Airbnb/VRBO import not found.** |
| Referral program (anti-gaming) | **PARTIAL** | referral code accepted at booking, reward rows written `pending`; **no anti-gaming rules, no payout flow** |
| Repeat-guest discount | **SPEC** | no code found |
| Security deposits | **PARTIAL** | `securityDeposit` per property (500/500/1000) and damage tracking exist; **never charged or held** |
| STR registration number per property | **SPEC** | not found. **Compliance item** — Toronto requires display. |
| Cancellation policies | **SPEC** | only "deposit is non-refundable" copy in checkout |

## Design system

| item | status |
|---|---|
| Cormorant Garamond / DM Sans | **BUILT** — `--serif` in use throughout |
| Noir / Chalk / Linen / Sand / Amber | **BUILT** — `--noir`, `--amber`, `--stone`, `--muted`; `lib/design-tokens.ts` is the light-shell counterpart |
| Near-zero radius, no shadows/gradients | **BUILT** — consistent in the new shell |
| Headline "Stay with us." | **BUILT** |
| **Brand name** | **OPEN DECISION** — blocks anything that prints a name |

---

## If it were sequenced

1. **Block 1 deploy**, then **Block 2** regression sweep.
2. **The two launch blockers** — before the guest site opens, not before anything
   else. They gate the launch, not the roadmap.
3. **Decide the reservation model** — 5%/24h-hold or 10% deposit. Blocks the flow work.
4. **Payment reconciliation** — the biggest recurring time cost.
5. **Jan–May backfill** — blocks trustworthy 2026 numbers.
6. Features: multi-guest step 3, parking, P&L, portal/hub convergence.
