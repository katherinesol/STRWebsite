── TAX: THE SETTLED CONTEXT (do not re-investigate) ──

- Airbnb did NOT collect accommodation tax, over-collected or under-collected on
  some bookings because of a SETTINGS issue on the listings (per-listing cutoff
  dates: Nickel Beach 24 Mar–23 Apr 2026, RYW 4–6 Jul 2026). This is KNOWN and
  UNDERSTOOD. Katherine is aware she owes tax that was not collected.
- Do NOT re-investigate the cause, do NOT re-audit the rows, do NOT produce
  accountant handoffs or remittance-mechanics advice, do NOT debate over- vs
  under-collection framing. All of that is settled.
- THE ONLY JOB: compute how much is OWED under the MAT and HST rules, per
  property and per filing period, and report the number so Katherine can remit
  it. That's it.

── THE RULES TO APPLY ──

- HST 13% on accommodation + cleaning (Ontario).
- MAT: Port Colborne 4% on room; Toronto 6% on room (RYW/RYE). Use the base
  already encoded in `lib/tax-rates.ts` — do not re-decide it.
- For each booking where tax was under-collected: owed = (tax the rules say
  applies) − (tax actually collected). Sum by property and by tax type (HST /
  Port Colborne MAT / Toronto MAT) and by filing period.

── THE OUTPUT KATHERINE NEEDS ──

One table: `property | filing period | HST owed | MAT owed | total owed`, plus a
per-booking backup she can hand to the CRA or the City if asked. **ANSWERED: $4,121.83** — HST to CRA 2,903.22, MAT to Port Colborne 750.54, MAT
to Toronto 78.51, plus 389.56 whose HST/MAT split needs receipts. Full working
and the per-booking backup are in `docs/reconciliation-2026.md` under *OWED BY
BUCKET*. **This computation is CLOSED.**

---

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
