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
| **Blanket Nickel Beach skip** | `automations/route.ts` ~line 111 | `if (isAirbnb && property_id === 'nickel-beach') continue` contradicts the per-lock `airbnb_managed` flag. Port Colborne is not Airbnb-managed and should be swept. Airbnb guests there get a code only by hand. **Open.** |
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

## Big builds

- **Payment reconciliation — ONE build, not three.** Platform bookings have no
  payment history, invoice payments have no account, invoice payments have no
  reference: one problem seen three ways. Scoped in [README.md](README.md).
  **Highest-leverage item here** — it is what made this week's 39-booking
  reconciliation manual.
- **Combined P&L.** Wanted eventually; explicitly not part of the Money rebuild.
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

## Data & reconciliation remaining

- **1 Jan – 15 May 2026 was never entered.** All three properties, all platforms.
  **No 2026 total is trustworthy until it is.** Largest open data item.
- **Host-fee percentage sweep** — every booking against its receipt. A wrong
  percentage means a wrong payout; Josh Klein's was overstated by $533.75.
- **Tudor's $243.54** — tax collected on a refunded night, still in hand. Refund
  the guest or remit the full 738.27. **A decision, not a task.**
- **MAT return treatment** — the credit to confirm at filing.
- **Heremela repair costs** — to sit against the $2,464.57 recovered.
- **Molhem's VRBO trace** — a note pointing at a booking in the missing months.
- **Per and Mikaela stay at $0 deliberately.** The flag doing its job is the point.

## Parked decisions

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
