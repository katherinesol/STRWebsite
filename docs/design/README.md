# The Keyholder design doc is the source of truth

Before designing a keyholder screen, look for it in the doc. Several are already
drawn, and inventing a second design for a screen that has one is how a system
drifts. Ask for the bundle (`STR Portal.html`) if it isn't checked in beside this
file — it is a single self-contained page, six turns deep.

| Turn | Screen | Built? |
|---|---|---|
| 1a | Home — dark operator console | not chosen |
| 1b | Home — light, one-thing-at-a-time | **chosen**, informs Today |
| 1c / 2a | Booking detail | **next** — legacy `/admin/bookings/[id]` still |
| 3a | Stays — timeline | partial |
| 3b | Money | partial |
| 4a | Stays — month grid | **built** · `components/keyholder/MonthGrid.tsx` |
| 4b | Stays — list | not built |
| 5a | Invoices — list | **built** |
| 5b | Invoice — edit | **built** |
| 6a | **Haussy** | **built** · `components/keyholder/HaussyChat.tsx` |
| 6b | Concierge (training + knowledge merged) | not built |
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

**Also queued, from tonight**

- 2a phases D (port the writes), E ("Add the figures" panel on `/figures`),
  F (repoint `hrefFor` and Today's links).
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
- 6c People: guests, contacts and inbox. Guest contact details still live only
  on the legacy `/admin/guests` pages.
