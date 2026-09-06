# rental-direct

Short-term-rental management for three properties — Nickel Beach (Port
Colborne), Royal York East and Royal York West (Toronto). Next.js + Supabase,
deployed to Vercel.

Read [AGENTS.md](AGENTS.md) before writing code and [DEPLOY.md](DEPLOY.md)
before shipping. Deploys are published from a clean checkout, never from the
working directory.

---

## Key learnings

Written down because each one was expensive to discover and easy to re-derive
wrongly.

### 1. Tax receipts are truth. Never fit a formula to them.

**Tax was not consistently charged.** Some guests were charged nothing, some
were undercharged, some were charged at the wrong rate. This is documented in
[docs/reconciliation-2026.md](docs/reconciliation-2026.md) with the receipts to
prove it:

- Airbnb collected **no accommodation tax at all** on bookings reserved before a
  cutoff — Brendan, Marc, Mark and Heremela together owe **$2,177.01 against
  $234.49 collected**, leaving **$1,942.52 out of pocket**.
- The cutoff is decided by the **booking date, not the stay date**, and it is
  **per listing** — Nickel Beach switched between 23 Mar and 16 May 2026; Royal
  York West between **4 and 6 July**, two days, pinned by Jensen and Lashley.
- Dan Kovalcik was billed **11% HST instead of 13%**, and 8.5% MAT on a stay
  after the city rate fell to 6% — two platform errors on one reservation.
  Robert Ma carries the same 11%.
- **"Did the platform collect tax" is not yes-or-no.** Three states have been
  seen: nothing at all, *partial* (Jensen — MAT charged, no HST, $140.52 of
  $266.08 uncollected), and fully taxed.
- Four distinct ways the stored figures have been wrong, including
  "backed-out-inclusive" — room+cleaning treated as tax-inclusive and divided by
  1.17.

So: read what the guest **actually paid** off the receipt, compare it to what
was remitted, and the difference is a **per-guest remittance correction**. The
output of a tax audit is a net correction to a payment. It is never a corrected
formula, because there is no rule to find where no rule was applied.

Only **direct bookings** — where no platform receipt exists — get tax computed
by us, through `lib/tax-rates.ts`.

### 2. Platforms change fee models and rates without notice.

Already observed, all in 2026, all inside this one dataset:

- **Split-fee (3.0%) and host-only (15.5%)** commission side by side, at the
  same property, in the same month. They produce different tax bases. Josh
  Klein's payout was overstated by **$533.75** by assuming the wrong one.
- **11% and 13% HST** both billed by Airbnb.
- **8.5% and 6% Toronto MAT applied simultaneously** — Quentin booked 10 August
  at 6% while Jerry (11 Aug), Kevin (13 Aug) and Amber (14 Aug) were all charged
  8.5%. No rule fits; it is recorded as an observed inconsistency.
- MAT base changed mid-year: early bookings on room+cleaning, later on room
  only.

Never hardcode a platform formula. Treat **fee model, commission rate and tax
base as per-booking variables read from that booking's receipt.** The one stable
relationship is the payout identity:

```
accommodation − discount + cleaning + extras + taxes_you_remit
    − commission − payment_processing_fee  =  payout_amount
```

Use it to **verify** a row. Never use it to derive a rate.

### 3. Read the ledger before re-deriving anything.

[docs/reconciliation-2026.md](docs/reconciliation-2026.md) is the record of what
has been reconciled and how. **In-system reconciliation is closed** — 39
platform bookings, all through the figures endpoint, all payouts reconciling,
verified against the database rather than against the list.

On 2026-09-03 an "audit" was run that tested stored rows against a tax formula
and flagged every row that did not fit. It produced sixteen findings. Nearly all
of them were false:

- **Аня Землюк was flagged for being correct.** Her receipt matches her stored
  figures exactly; she failed only because her receipt was unusual.
- **Dan and Robert were reported as a model failure** when the 11% billing was
  already documented, with the arithmetic, in the ledger.
- The exercise was about to ask for **sixteen receipts that had already been
  supplied and reconciled**.

A formula-fit audit of already-correct rows manufactures findings. The rows were
not wrong; the formula was. **Check the ledger first, and test against it rather
than around it.**

---

## Getting started

```bash
npm run dev
```

Then [http://localhost:3000](http://localhost:3000).

## Where things live

| | |
|---|---|
| Deploy procedure and the held-file guard | [DEPLOY.md](DEPLOY.md) |
| Tax reconciliation record | [docs/reconciliation-2026.md](docs/reconciliation-2026.md) |
| Open work | [docs/design/BACKLOG.md](docs/design/BACKLOG.md) |
| Lock worker (runs locally, never on the server) | [tools/schlage/](tools/schlage/) |
