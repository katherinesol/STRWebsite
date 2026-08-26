# The Keyholder design doc is the source of truth

Before designing a keyholder screen, look for it in the doc. Several are already
drawn, and inventing a second design for a screen that has one is how a system
drifts. Ask for the bundle (`STR Portal.html`) if it isn't checked in beside this
file — it is a single self-contained page, six turns deep.

| Turn | Screen | Built? |
|---|---|---|
| 1a | Home — dark operator console | not chosen |
| 1b | Home — light, one-thing-at-a-time | **chosen**, informs Today |
| 1c / 2a | Booking detail | **built** · `components/keyholder/BookingDetail.tsx` |
| 3a | Stays — timeline | partial |
| 3b | Money | partial |
| 4a | Stays — month grid | **built** · `components/keyholder/MonthGrid.tsx` |
| 4b | Stays — list | not built |
| 5a | Invoices — list | **built** |
| 5b | Invoice — edit | **built** |
| 6a | **Haussy** | **built** · `components/keyholder/HaussyChat.tsx` |
| 6b | Concierge (training + knowledge merged) | **built** · `/keyholder/property/concierge` |
| 6c | People (guests + contacts + inbox merged) | not built |
| 6d | MAT return, as a tab under Money | **built** · `/keyholder/money/tax` |

## Things the doc settles that are easy to get wrong

- **The shell owns the gutter.** 40px horizontal, applied once in
  `app/keyholder/layout.tsx` and to the nav's inner box so the logo and the page
  title share a vertical line. Pages set vertical padding only. Every screen
  inventing its own gutter is what left Haussy, Tax and Invoices at x=0.
- **Platform colour is identity, not decoration** — Airbnb red, VRBO blue, Houfy
  teal, direct in Solhaus gold with dark text. `platformColour()` in design-tokens.
- **Bubbles point at their author.** User `14px 14px 4px 14px` on ink;
  assistant `14px 14px 14px 4px` on `oklch(0.965 0.005 85)`, and the assistant is
  allowed to run wider (82% vs 70%) because it does the explaining.
- **A composer belongs inside its card** at `margin-top:auto`, never
  `position:sticky` over the page — sticky reserves no space, so the last message
  slides under the Send button.
- **Red on a figure means the arithmetic disagrees**, not merely "large".

## 2a, booking detail — why it matters more than it looks

It is the landing page for nearly every link the new screens emit:

- Today → **Set code** (platform arrival inside 72h with no `door_code`)
- Today → **Add the figures** (a stay carrying no total — how Per Polderman and
  Mikaela Manley get filled in, which is what clears their Needs You rows)
- Today → arrivals, departures, in-residence, and every row of The week
- Calendar → `hrefFor()` in `MonthGrid` and `StayAgenda`, both variants
- Phase E moved the early/late-checkout grants off the calendar and onto here

Until 2a is built those all land on the dark legacy pages, so the redesign has a
seam running straight through the middle of it.

It is also where the **held `apply_tax` toggle** is designed to live, on the
platform variant. Build the page so the toggle drops into a slot that already
exists; do not unhold it — the VRBO/Airbnb audit decides what each platform
actually remits, and shipping the switch before that settles is what the hold is
for.

The parked tax batch lives in [../vrbo-airbnb-audit.md](../vrbo-airbnb-audit.md).

## Locks and the door-code sweep

Queued from the night of 2026-08-23, after the sweep was triggered by hand and
proven to work: it selected exactly the one qualifying booking, programmed both
non-Airbnb-managed locks, left the Airbnb-managed unit door and every existing
code untouched.

**The false-failure alarm — the highest priority of these.** After creating a
code the sweep immediately re-lists and demands `status === 'set' ||
is_scheduled_on_device`. Seam is asynchronous: at creation a code reads `unset` /
`on_device=false`, and roughly thirty seconds later it reads `on_device=true`.
The check runs inside that gap, so it cannot be satisfied, and a future-dated
code can never report `set` anyway because its window has not opened. Every
advance booking the sweep programs therefore emails a failure that is wrong —
two arrived for a booking that had programmed perfectly. An alert that always
fires is one that stops being read, which is precisely how a real failure gets
through. Re-check after a delay, or treat a just-created future-dated code as
pending rather than failed. Fix this before anything else here.

**Ziyue Jia's code has not landed.** `5105` on Royal Side was created 2026-07-29
and still reads `on_device=false` nearly four weeks later, where Kristine's went
on within a minute. She arrives 4 September. Seam may only push a code within
some horizon of its window, which would make this normal — but it is the one
code that does not fit the pattern. Read Seam directly closer to the date, and
if it has not landed by about 48 hours before, program it by hand.

**The sweep cannot see freshly-synced bookings.** iCal inserts rows with
`reason: 'manual'` and `is_booking` defaulting false, while the sweep selects on
`is_booking = true`. Such a row is not merely uncoded — it never reaches the
`if (!code)` branch, so it does not even raise the "no code on booking" alert.
That is what hides the 2026-09-01 Royal York West row: no code, no guest name,
no warning. The predicate should ask whether this is a platform reservation, not
whether someone has finished entering its money.

**A blanket property skip contradicts the per-lock flag.** `if (isAirbnb &&
b.property_id === 'nickel-beach') continue` drops Airbnb bookings at Nickel
Beach entirely, but Port Colborne is `airbnb_managed=false` and by the per-lock
rule should be swept. It reads as a leftover from before the flag existed.
Consequence: Airbnb guests at Nickel Beach only get a code if someone sets one
by hand through `/admin/locks`, with no automation and no alert.

The last two widen what the sweep touches, so they want a reviewed change rather
than a late-night one.

## Door activity — the display was orphaned, the data never stopped

Investigated 2026-08-25 after the door log was reported missing. It was reported
as a "worked before, gone now" regression, the same shape as the invoice
bank-selection one, and that reading was right.

**Nothing was deleted.** `/admin/door-activity` and its API were built in one
commit — `ead01e2`, 2026-08-02, *"per-property code-entry + check-in log, grouped
by day, Toronto time; backfilled 29 historical entries from Seam"* — and no
commit has touched either file since. The live page returns 200 with 150 entries.

**The data is healthy.** A Seam webhook at
[app/api/webhooks/seam/route.ts](../../app/api/webhooks/seam/route.ts) writes
`door.entry` and `booking.checked_in` into **`system_log`** — not a
`lock_events` table, which is why searching the obvious names finds nothing. 176
door and check-in events between 2026-07-29 and now. It is also what sets
`checked_in_at` on the booking.

### 1. The Locks & Access group was left behind by the shell migration

`KeyholderNav` carries six tabs — Today, Stays, Money, Property, People,
Assistant. The legacy `AdminNav` has a **Locks & Access** group that has no
equivalent in the new shell: **Locks, Door Activity, Staff Access, System
Activity**. Four owner-only screens, reachable only through the small `/admin`
link in the nav corner.

Not the calendar redesign, not the sync-to-cron move, not any lock work — the
screens were simply not carried across. **Restore the group in `KeyholderNav`.**
Smallest of these fixes and the one that gives back what was noticed missing.

### 2. Shared-door entries are attributed to the wrong property

The shared front door is **one physical Seam device registered under both
properties**:

    353f9825-0c5a-4940…  →  royal-york-east/Royal Side  +  royal-york-west/Royal Side

The webhook resolves it with `.eq('seam_device_id', …).limit(1).maybeSingle()`,
which arbitrarily returns royal-york-east, then filters candidate bookings to
that property. **A Royal York West guest can therefore never match on that
door.** Observed live: `Royal Side opened with an unknown code's code (6286)`
while 6286 was Kristine Nguyen's active RYW code.

Two consequences, the second worse than the first. Every shared-door entry is
misattributed and reads as an unknown code. And because `checked_in_at` is only
set on a *matched* booking, **a guest whose first entry is the shared door never
gets a check-in recorded.** Kristine only got one because she also opened Apt 2.

The fix is to stop assuming one device means one property: match the code against
bookings at *any* property the device is registered to, and attribute to the
booking that matches. The malformed `"an unknown code's code"` string is worth
fixing in the same pass.

### 3. "Doors, this stay" was skipped on a false premise

The design doc draws a per-stay event log on booking detail — *"Royal Side opened
with Jerry's code, 4:07 PM"*. It was not built, and the comment at
[components/keyholder/BookingDetail.tsx:23](../../components/keyholder/BookingDetail.tsx)
records why:

> *"There is no lock_events table and no activity_log in this database; those
> events live in Seam and would need a live per-lock call."*

**That is wrong, and it is sitting in the codebase as a justification for the
gap.** The events are in `system_log`, indexed by property and timestamp. A
per-stay view is a query bounded by the stay's dates — no Seam call. Build the
view and **delete the comment**, so the false claim cannot justify the gap twice.

Fix order: nav restore (smallest, restores what was lost), then the shared-door
bug (it is misattributing entries right now), then the per-stay view.

## Payment reconciliation — one build, not three

**The problem is single: a recorded payment cannot be matched to a bank
deposit.** Reconciling to a statement needs four things about each payment —
date, amount, which account it moved through, and a reference that identifies it
— and the system holds at most two of them. It surfaces in three places, and
they are the same gap seen from three angles, so fixing any one alone leaves the
problem intact.

1. **Platform bookings have no payment history.** `calendar_blocks` has a single
   `amount_paid` and nothing that can hold two dated deposits. Samuel Séguin's
   stay was paid as C$5,817.65 on 2026-02-16 and C$1,424.65 on 2026-05-19, both
   completed Stripe payments through Houfy; they are recorded in the booking's
   `notes` with their payment-intent ids. Traceable by eye, not reconcilable.
   Direct bookings do have a three-instalment schedule, so the capability exists
   on one side of the app and not the other.
2. **Invoice payments have no account.** No `bank_accounts` table exists and
   `invoice_payments` has no `account_id`. The nearest thing is `method`
   (etransfer / billpay / card / cash / cheque) with `method_detail` and
   `method_last4` — which says *how*, never *from where*.
3. **Invoice payments have no reference.** `method_detail` is free text and the
   API already accepts it, and the invoice page already renders it — but the
   form never collects it, so nothing can ever put a value there. And
   `method_detail` means "which card", not "e-transfer confirmation number", so
   overloading it would be the wrong fix.

**The saved-method chips are not this.** The legacy invoice screen let you pick
from `(method, method_detail, method_last4)` combinations you had used before —
"BMO ···0377", "Wealthsimple ···5836" — and the redesigned payment panel dropped
that control. It has been restored, because twenty of twenty-one payments carry
those values and losing the picker made every payment a retype.

**Restoring it closed a convenience gap, not the reconciliation gap, and the two
are easy to confuse.** "BMO ···0377" is a label a person reads. It is not an
account: nothing can take it and match a row against a bank statement, because
there is no account record to match to and no reference identifying the
individual transfer. A screen that now looks complete still cannot reconcile.
The feature below is what would.

**What to build:** one payment record carrying account and reference, supporting
several payments per booking or invoice, usable from both the platform-booking
and invoice sides. Everything above follows from that; nothing above is worth
doing on its own.

Treat it carefully — it touches the financial schema, and `invoice_payments`
already holds real money movements.

## The Money tab bar links to two pages that do not exist

`app/keyholder/money/layout.tsx` declares four tabs. `/keyholder/money/invoices`
and `/keyholder/money/tax` exist; **`/keyholder/money/income` and
`/keyholder/money/expenses` were never built** and 404. Expenses do exist, but
only on the old admin side at `/admin/property-management/finance`, where the
category view is client-side state rather than a link — which is why filtering
by category felt unreachable rather than broken. Nothing regressed here; two
pages are simply missing from a nav that promises them.

## Booking detail & People — four issues from using it

Captured 2026-08-25 while reconciling. Not started; the reconciliation finishes
first.

**1. Early check-in and late checkout cannot be edited — only granted.**
Confirmed rather than assumed: `GrantsField` writes `early_checkin_granted` and
`late_checkout_granted` and nothing else. It *displays* the requested time as
read-only text and offers Granted / Refused chips. There is no control anywhere
on the redesigned page to change 4:00 PM to 3:00 PM.

**This is not the port-BookingActions work.** `BookingActions` on the legacy page
also only grants. The times themselves are already in the `EDITABLE` allowlist on
both PATCH endpoints — changing one is a single request, and doing exactly that
by hand is how Kristine Nguyen's check-in moved to 3pm on 24 August, which also
reprogrammed both locks. So the endpoint is finished and only the control is
missing: a small piece of work on `GrantsField`, independent of the retirement.

Worth pairing with the lock consequence, because editing a time reprograms the
door: the PATCH triggers `reprogramBookingWindow` whenever a timing field
changes, so the control should say so rather than silently moving a code window.

**2. The People page has no search and no filters.** It loads every guest
ordered by name and splits them into three fixed groups — returning, stayed
once, never stayed. With 42 guests that is already awkward and it only grows.

At minimum a name/email search box. Worth considering beyond that: property
(who has stayed at which), has an upcoming stay, missing contact details — that
last one is genuinely useful now, since a guest with no surname cannot verify
and a guest with no email cannot be sent anything. Sorting by last stay or by
lifetime value rather than only alphabetically.

**3. Early/late times should say "standard" when they are standard.** The card
prints `asked for 4:00 PM` whenever a time is present, which reads as a special
request even when 4:00 PM *is* the standard check-in. It should compare against
the property's standard and only call it a request when it is genuinely earlier
or later — otherwise show "standard 4pm" and "standard 11am".

This needs the standard times to live somewhere. They are currently implicit:
`windowFromBooking` in `lib/seam.ts` defaults to 16:00 check-in and 11:00
checkout when no time is set, and nothing else declares them. They should be
per-property configuration, since Nickel Beach and the Royal York suites need not
share a check-in hour, and the comparison should read from that rather than from
a constant buried in the lock helper.

## Retire the two legacy booking pages — its own piece of work

`/admin/bookings/[id]` and `/admin/bookings/block/[id]` are the last dark screens
with a redesigned component living inside them. A coverage check on 2026-08-24
ruled out a straight redirect: **six capabilities exist only there**, and none
of them appears in `BookingDetail` under any name.

| Component | Lines | Page | Note |
|---|---|---|---|
| `BookingActions` | 323 | direct | **The critical one.** Cancel with a reason, refund amount, mark active / completed, mark deposit received, mark final payment received, grant early check-in and late checkout. There is nowhere else to cancel a booking or mark a payment received. `GrantsField` already covers the grants half; the rest has no equivalent. |
| `GuestEditCard` | 123 | direct | Guest contact editing from the booking. Also closes the "port guest edit into People" backlog item — `/keyholder/people/[id]` has no edit UI at all, and this is the component to move. |
| `WindLogCard` | 97 | both | Wind history — damage evidence for Nickel Beach. |
| `PaymentReminderForm` | 94 | direct | **Already broken** — POSTs to `/api/admin/bookings/[id]/send-reminder`, which does not exist. Retiring the page would delete a broken feature silently. Fix it or drop it deliberately; do not let the retirement decide by accident. |
| `BookingSupportCard` | 52 | both | The guest's support access code and the link to `/support` — directly tied to the verification gate. |
| `WaterUsageCard` | 49 | direct | Cistern usage across the stay. |

### The dependency that sets the timing

**`BookingEditForm` and `PlatformBookingForm` are mounted only on these two
pages**, and both are held from deploy pending the VRBO/Airbnb audit — they carry
the tax toggle. Retiring the pages would leave the toggle with nowhere to live
*even after the audit unholds it*, which would turn a finished piece of work into
a stranded one.

So either **retire after the audit resolves**, or **give the toggle a new home
first** (most likely inside `FiguresPanel`, where the rest of the tax figures
already are). This is the constraint that makes it post-audit work rather than a
tidy-up.

### Not urgent

Until then `GiftCard` renders in light tokens inside two dark pages. It looks
dated rather than broken, and that is the accepted cost of not carrying two
palettes — the same trade the Money retirement made.

## Combined P&L — wanted eventually, not part of the Money rebuild

Income minus expenses equals net profit, as its own screen. Deliberately **not**
part of building `/keyholder/money/income` and `/keyholder/money/expenses`,
which stay a revenue list and an expense list respectively.

**When it is built it must include non-booking income, or it will be wrong.**
That money is real, received, and appears on no reservation: Mark's $100
additional-guests fee, Brendan's $175, and Heremela's $2,464.57 damage recovery
across three payouts. `/keyholder/money/income` is bookings-only by decision, so
nothing else in the app will surface these — a P&L drawn only from bookings and
expenses would silently omit them. There is also no table for them yet, so the
P&L work carries a schema piece with it.

Related: damage recovery may be income or an expense offset, which changes the
net. That is the accountant's call, recorded in the reconciliation ledger.

## Backlog

**Parking is old UI and thin on features.** `ParkingControl` and `/admin/parking`
predate the redesign and were never carried into the new shell's visual
language. Beyond the restyle it wants a proper scoping pass of its own: what a
parking record should hold, how plates arrive and get confirmed, what the guest
sees, and how it relates to `vehicle_count` / `plate_numbers` / `plates_pending`
on the booking. Not a restyle job dressed up as a feature — scope first.

**Email stats** — open rates, click rates, unsubscribes, bounces, delivery.
Not started; needs investigation before it can be scoped.

- Find out what Resend already captures versus what needs webhooks, an events
  table, and tracking switched on.
- The split is likely two products, not one: delivery and bounce belong to
  transactional mail; open, click and unsubscribe belong to anything marketing
  or newsletter.
- Forward-looking only. There is no retroactive open data to backfill.
- Open rates are imperfect and should be labelled as such on any screen that
  shows them — Apple Mail Privacy Protection pre-fetches images and inflates
  them.

**Booking import has never worked — both branches.** `/admin/bookings/import`
is linked from `/admin/bookings`, the form offers all five platforms, and
`/api/admin/bookings/import` fails whichever one you pick. The direct branch
never sets `guests`, which is `NOT NULL` with no default (`23502`). The platform
branch inserts `check_in`/`check_out` into `calendar_blocks`, which has
`start_date`/`end_date` and no such columns (`PGRST204`) — it sets both pairs, so
the right two are present but the wrong two poison the insert. Confirmed by
running exactly what the route inserts, and by the absence of any row bearing
its signature: no booking with `status='completed'` + `payment_method='etransfer'`,
no calendar block with an `"Imported - …"` note. It has never once succeeded.
Two one-line fixes, deliberately **not** folded into the create_booking_full
routing — an untested repair does not belong inside a refactor.

**`create_booking_full` owes two fixes, to go in together.** It does not
generate a `confirmation_code`, so a direct booking created through it has no
guest access at all — the gate matches on that column, and `RS-1005` and
`RS-1006` both have none. And it does not populate `first_name`/`last_name`, so
its guests rely on the last-token fallback in `surnameOf`. Both sit in the same
insert; details at the top of [supabase/create_booking_full_v2.sql](../../supabase/create_booking_full_v2.sql)
— **v2 is the installed one**; the unsuffixed file is superseded and editing it
changes nothing.
The four TypeScript creation paths already handle both.

**Multi-guest access** — recording several people on a booking and letting them
reach the guest-facing features. Scoped in [multi-guest.md](multi-guest.md);
data model, the access/security approach, and the decisions still open. The
guest-contact-edit item below is step one of it rather than a separate job.

**Guest contact details cannot be edited.** There is no working path to change a
guest's name, email or phone anywhere in the app. The People detail page shows
them read-only; whether the control was never built or the endpoint behind it is
missing needs checking first. Until it exists, a wrong address can only be fixed
in the database, which is how placeholder emails have stayed wrong.

**Gift section — occasion dropdown and restyle, as one job.** The occasion
control shown in the legacy design was never real: there is no `occasion` column
and no dropdown. Adding the column and the control is the same piece of work as
taking `GiftCard` off the legacy dark styling, so do them together rather than
touching the component twice. The rule that survives both: the note text is
never loaded into a page.

**Historical stays cannot be back-filled, so repeat guests read as new.** Per,
Alain and Jason have each stayed several times over past years, but those
bookings predate the system and there is no way to record a completed stay after
the fact. `guest-stats` derives `returning` from trips in the database, so all
three show as first-time guests and always will. Needs a way to enter a
historical stay — property, dates, and enough for the trip count, without
implying a live booking. Related: no booking of any kind exists before
2026-05-16, so this is not three guests, it is every guest.

**Also queued, from tonight**

- **Payment reminders and outbound email.** `PaymentReminderForm` POSTs to
  `/api/admin/bookings/[id]/send-reminder`, which does not exist — the button has
  been 404ing on the legacy page. Dropped from 2a rather than ported. Building it
  means template, audit trail and Resend decisions, so it belongs with the
  email-stats item above as one piece of outbound-email work.
- **GiftCard, StayChecklist and ParkingControl still wear the legacy dark
  styling** on the new page. They were mounted unchanged rather than
  reimplemented — GiftCard earns its keep by never loading the note text, and a
  rewrite is how that gets lost. Restyle without touching behaviour.
- Today's "Set code" check only asks whether `door_code` is filled, not whether
  the code reached the lock or is yet DUE to. A smarter version flags a booking
  only when a code should have programmed by now and did not — codes program
  close to check-in by design, so a future arrival without one is normal.
  Needs the "when should it be on the lock" threshold defined first.
- Haussy's confirm card warns "Creating this makes a second, separate booking"
  while in enrich mode, because the overlap query and the merge-candidate query
  return the same row. Confirming merges correctly; the warning says the
  opposite of what happens.
- Haussy fills `taxes_platform_remits` from the rule (MAT owed) rather than from
  the screenshot (what the platform actually kept). On Kristine Nguyen that is
  52.50 against a real 80.24, and only the real figure reconciles the payout.
- The extractor asserts Airbnb uses the host-only fee model and that a guest
  service fee is "typically $0". Split-fee bookings still exist — Kristine's has
  a $150.60 guest fee and a 3% host fee — so it flags correct data as suspect.
- **Two door-code write paths.** The new field on the booking page writes through
  the hardened PATCH; `/admin/locks` writes through `POST /api/admin/locks/set-code`.
  Both handle the lock_code / door_code split correctly today, which is exactly
  why they will drift. Collapse to one when either is next touched.
- **Gift section: occasion dropdown + restyle, together.** `booking_gifts` has
  note, amount, date and vendor — no occasion field, and no list to pick from.
  The card is also still in legacy dark styling on the new booking page. Adding a
  dropdown to a card that is about to be redrawn is work done twice; do both in
  one pass, and keep the booking_id-only load untouched while doing it.
- **Concierge entry usage counts.** Design-doc 6b shows "USED 41×" per entry.
  Nothing records a hit and `knowledge_base` has no counter column, so it needs a
  migration plus a write when the bot cites an entry. Skipped for now; genuinely
  useful later for spotting entries no guest ever needs.
- **`guest_questions` is written by nothing.** The table exists with the right
  shape — question, bot_answer, needs_followup, answered — and holds two rows
  from some earlier path, but the concierge does not log a question when it
  escalates. So the "questions it couldn't answer" panel is real and will never
  grow. Logging on `[[ESCALATE]]` is the fix, and then teaching from a row should
  mark it answered, which also needs an endpoint since nothing updates that table.
- **Guest verification is code + surname.** A confirmation code appears in every
  platform email and a surname is guessable; passing both releases the door code.
  Rate-limited to 8 failed tries per IP per 15 minutes. A decision worth revisiting,
  not a bug.
- 6c People: guests, contacts and inbox. Guest contact details still live only
  on the legacy `/admin/guests` pages.
