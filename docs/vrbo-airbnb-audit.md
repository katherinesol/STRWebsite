# VRBO / Airbnb tax audit — parked batch

What the platforms actually collect and remit, versus what the rules say is owed.
Nothing here is fixed in passing: each row needs the original screenshots re-opened
and checked against source. The batch also gates three files held out of deploy —
`TaxToggleField.tsx`, the `BookingEditForm` / `PlatformBookingForm` toggle edits,
and the Q2 master switch in `toronto-mat-report/route.ts`.

## 1. Airbnb bills Toronto MAT by a different method

Found on Kristine Nguyen, Royal York, 24–29 Aug 2026, room $875 + cleaning $69.
Both figures decompose exactly, which is what makes this a method difference and
not a rounding one:

| | Airbnb charged | the rules say | |
|---|---|---|---|
| MAT | $80.24 — **8.5%** on room **+ cleaning** | $52.50 — 6% on room only | over $27.74 |
| HST | $122.72 — 13% on room + cleaning, **MAT excluded from the base** | $129.55 — 13% incl. MAT | under $6.83 |
| total | $202.96 | $182.05 | **over $20.91** |

Three things to settle:

- Airbnb is applying **8.5%**, the Toronto rate that expired 31 July 2026, to an
  August stay. Is the hike window in `lib/tax-rates.ts` right, or is Airbnb late?
- Airbnb applies MAT to room **+ cleaning**; `computeTaxSplit` applies it to the
  room alone. Which is correct for Toronto?
- Airbnb excludes MAT from the HST base; the rules include it.

The net (+$20.91) hides two larger opposing errors. Reconcile the parts, not the net.

## 2. Rows whose `taxes_collected` is the host-side figure

Haussy's extractor read Airbnb's **You earn** tab rather than **Guest paid**, so
`taxes_collected` holds HST only and understates what the guest actually paid.
The signature is `taxes_collected == 13% × (room + cleaning)` to the cent.

| guest | property | stored | rules say owed |
|---|---|---|---|
| Lashley Winter | Royal York West | $141.57 | $237.62 |
| Jasmine Denham | Royal York West | $22.75 | $34.62 |
| Ziyue Jia | Royal York West | $77.22 | $112.82 |
| Kristine Nguyen | Royal York | *never saved* | $182.05 |

All Airbnb, all Royal York West. Each needs its screenshots re-opened and the
guest-paid total read off before anything is rewritten. Three further platform
rows carry no `taxes_collected` at all.

The extractor prompt is being fixed separately so new reads take the right tab;
that fix does not touch these rows.

## 3. Already known, still parked

- Tudor and Amanda: `taxes_you_remit` double-counted. Pre-existing.
- 19 of 28 platform bookings carry null tax from the legacy enrich route.
- `LSQUHDC829` / the $558.11 untracked payment.
