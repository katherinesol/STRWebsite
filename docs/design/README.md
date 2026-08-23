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
