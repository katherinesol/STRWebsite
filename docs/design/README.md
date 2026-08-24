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

## Backlog

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
