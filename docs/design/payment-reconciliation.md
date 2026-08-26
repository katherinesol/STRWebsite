# Payment reconciliation — design

**Stages 1 and 2 are complete and verified.** Stage 1 (schema) and Stage 2
(migration) ran on 2026-08-26; results at the foot of this file. Stage 3 (reads)
is not started — `invoice_payments` remains the live source of truth. Originally
written as scope, read from the live database 2026-08-26. The 21 `invoice_payments` and 39 platform bookings are
untouched and stay untouched until the migration is approved separately.

The goal in one sentence: **match a recorded payment to a bank deposit.** Today
that is impossible, and it is what made this week's 39-booking reconciliation a
manual exercise.

---

## 1. What exists now — read from the database, not assumed

### There is exactly one payments table

`invoice_payments`, **21 rows**. Probed for `payments`, `booking_payments`,
`bank_accounts`, `accounts`, `transactions`, `bank_transactions`, `deposits`,
`payment_methods` — **none exist.**

```
id, invoice_id, amount, paid_at, method, status,
expense_created, created_at, method_detail, method_last4, due_date, expense_id
```

No `account_id`. No `reference`. `method_detail` is free text.

**The 21 rows are in better shape than expected.** 20 `paid`, 1 `planned`.
Methods: etransfer 14, billpay 3, card 2, cash 2. `method_detail` resolves to
just three institutions, and **18 of 21 carry a `last4`**:

| detail | last4 | rows |
|---|---|---|
| BMO | 0377 | 9 |
| Wealthsimple | 5836 | 7 |
| `BMO Business ` | 8671 | 2 |
| *(null)* | — | 3 |

Two of the three nulls are **cash** — correctly accountless. The third is a
billpay of $2,000.00 on 2026-08-24 with no detail at all: **the only row needing a
human decision.**

> **Data hygiene:** `"BMO Business "` carries a **trailing space**. The chips are
> derived *from these same rows* (`/api/admin/invoices/vendors` reads
> `invoice_payments`), so the typo propagates itself. Any match must trim.

### Platform bookings have no payment history — confirmed

`calendar_blocks` holds a single scalar `amount_paid`, set on **10 of 39** rows.
There is no history and no second-payment slot.

**Samuel's two deposits are in `notes`, exactly as suspected:**

> "Paid in two Stripe deposits via Houfy: C$5,817.65 on 2026-02-16
> (pi_3T1e61CnneSfKiFl1KaBHlma) and C$1,424.65 on 2026-05-19
> (pi_3TYsoiCnneSfKiFl0qpBFAZb) = 7,242.30. Neither is a refund."

Two real payments, with dates and Stripe payment-intent IDs — **structured data
living in a sentence** because there was nowhere to put it.

### `amount_paid` is stale and must not be migrated

Checked all 10 against the reconciled figures:

```
guest                amount_paid   payout     guest_total   equals
Heremela Molla         5541.42     5541.42      6624.17     payout
Marc Losier            2778.08     2778.08      3320.89     payout
Tudor Bertiean         3858.55     3323.04      4318.73     NEITHER
Josh Klein             4850.60     4316.85      5452.24     NEITHER
Samuel Séguin          7089.58     7242.30      7242.30     NEITHER
… 5 more                                                    NEITHER
```

**Only 2 of 10 match anything.** Tudor's 3,858.55 and Josh's 4,850.60 are
**pre-reconciliation values** — Josh's is the overstated payout from the host-fee
error, Tudor's predates the refund correction. Samuel's disagrees with his own
notes (7,089.58 vs 7,242.30).

**Conclusion: `amount_paid` is a legacy field that predates the figures endpoint.
Backfilling it into a payments table would import known-wrong numbers into fresh
money data.** It should be deprecated, not migrated.

### Direct bookings use three fixed column-slots

`bookings` (4 rows total) carries the schedule as columns, not rows:

```
deposit_amount, deposit_paid_at,
second_payment_amount, second_due_date, second_paid_at,
final_payment_amount,  final_due_date,  final_paid_at,
payment_method, stripe_payment_intent_id, stripe_deposit_id, security_deposit_status
```

Only **RS-1002** has real payments: 480.00 on 2026-02-26 and 4,320.00 on
2026-06-28, totalling its 4,800.00. Workable, but **capped at three**, with no
account, no reference, and no room for a partial or a fourth payment.

### So the same concept has three incompatible shapes

| | money | shape | history | account | reference |
|---|---|---|---|---|---|
| Invoices | out | rows | ✅ | ❌ | ❌ |
| Platform bookings | in | one stale scalar | ❌ | ❌ | ❌ |
| Direct bookings | in | 3 fixed columns | capped | ❌ | partial (Stripe) |

---

## 2. Schema design

### `bank_accounts`

```sql
create table bank_accounts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,          -- 'BMO Chequing'
  institution  text not null,          -- 'BMO'
  last4        text,                   -- '0377'
  kind         text not null default 'chequing'
                 check (kind in ('chequing','savings','credit','cash','other')),
  currency     text not null default 'CAD',
  active       boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create unique index bank_accounts_last4_uniq on bank_accounts (institution, last4)
  where last4 is not null;
```

Seeded with the three real accounts: **BMO ...0377**, **Wealthsimple ...5836**,
**BMO Business ...8671**.

**No "Cash" pseudo-account.** A cash payment has `account_id null` and
`method = 'cash'`, which is the truth; inventing an account to avoid a null would
make cash look like it hit a bank.

### `payments` — one table, both directions

The recommendation is **one unified table**, not two. The whole point is to ask
*"what hit BMO 0377 in July"* and get one answer. Two tables means two queries and
no single reconciliation surface — which is the problem being solved.

```sql
create table payments (
  id            uuid primary key default gen_random_uuid(),
  direction     text not null check (direction in ('in','out')),

  -- exactly one parent
  invoice_id    uuid references invoices(id) on delete cascade,
  booking_id    uuid,
  booking_kind  text check (booking_kind in ('direct','platform')),

  amount        numeric(12,2) not null,
  currency      text not null default 'CAD',
  status        text not null default 'paid'
                  check (status in ('planned','paid','failed','refunded')),
  paid_at       timestamptz,          -- null while planned
  due_date      date,

  method        text,                 -- etransfer|card|cash|billpay|stripe|platform_payout
  account_id    uuid references bank_accounts(id),
  reference     text,                 -- e-transfer ref, Stripe pi_, payout id
  slot          text check (slot in ('deposit','second','final','other')),

  note          text,
  expense_id    uuid references expenses(id),
  created_at    timestamptz not null default now(),
  created_by    uuid,

  constraint payments_one_parent check (
    (invoice_id is not null and booking_id is null)
    or (invoice_id is null and booking_id is not null and booking_kind is not null)
  ),
  constraint payments_paid_has_date check (status <> 'paid' or paid_at is not null)
);
```

`booking_id` + `booking_kind` deliberately mirrors **`booking_guests`**, which
already solves "this row belongs to a direct or a platform booking" in this
codebase. Same problem, same shape — not a new convention.

`slot` preserves what the direct-booking columns mean (deposit / second / final)
without capping the count: a booking can have four rows, or a partial, and still
label the scheduled three.

### The chips become account pickers

`/api/admin/invoices/vendors` currently derives method suggestions **from
`invoice_payments` itself** — a self-referential free-text loop, which is how a
trailing space became permanent. It should read `bank_accounts` instead. The chip
UI stays (it is genuinely quicker than a dropdown); what changes is that a chip
now carries an **`account_id`**, not a label.

---

## 3. Migration — nothing is mutated

**The governing rule: `invoice_payments` is never written to and never dropped in
this migration.** It is read, copied from, and left exactly as it stands, so
rollback is "stop reading `payments`".

### What moves

**All 21 `invoice_payments` → `payments`** as `direction: 'out'`, carrying
`invoice_id`, `amount`, `paid_at`, `due_date`, `status`, `method`, `expense_id`.
`account_id` resolved by **`trim(method_detail)` + `method_last4`** against the
seeded accounts:

- **18 rows** match on `last4` → `account_id` set.
- **2 cash rows** → `account_id` null, `method: 'cash'`. Correct, not a gap.
- **1 billpay, 2026-08-24, $2,000.00**, no detail → `account_id` null,
  flagged for you to assign by hand. **The only row needing a decision.**

`method_detail` and `method_last4` are copied into `note` verbatim so nothing is
lost even where matching fails.

**RS-1002's two real payments → 2 rows** (`slot: 'deposit'` / `'final'`,
`direction: 'in'`, `booking_kind: 'direct'`). The other three direct bookings have
no `*_paid_at` and produce no rows — a schedule that was never paid is not a
payment.

### What stays

- **The `bookings` payment columns stay.** The guest portal reads them today.
  They are backfilled *from* `payments` later, once the portal is switched — not
  dropped in this migration.
- **`calendar_blocks.amount_paid` is not migrated at all**, per the evidence
  above. It is marked deprecated in a comment and left in place.
- **Samuel's `notes` sentence stays**, word for word.

### What needs your explicit say-so — not automated

**Samuel's two deposits.** They should become two `payments` rows
(`method: 'stripe'`, `reference: pi_…`, dates as recorded). But that means
**parsing money out of free text**, and a regex over a prose sentence is exactly
the wrong tool for financial records. Proposal: **I write those two rows by hand
from the receipt**, show them to you, and leave the note in place — the same
one-at-a-time discipline as the 39 bookings.

The same applies to any other booking whose payments live in prose. I have not
searched for others yet; that is a task for the migration stage.

### How it is verified

Before switching any read:

1. `count(payments where direction='out') = 21`
2. `sum(payments.amount where direction='out') = sum(invoice_payments.amount)`
3. Every `invoice_payments.id` accounted for, by amount and `paid_at`
4. `account_id` populated on exactly 18; the 3 nulls are the 2 cash + the flagged billpay
5. The invoice detail page shows identical totals before and after

Read back from the database, not from the API's response.

---

## 4. What reads and writes change

| surface | change | size |
|---|---|---|
| **Payment logging** (`/api/admin/invoices/payment`) | writes `payments`; gains `account_id` + `reference`. Keeps writing `invoice_payments` during the dual-run, or stops once verified — **your call at that stage** | medium |
| **Invoice detail panel** | chips become account pickers backed by `bank_accounts`; reference field added | small |
| **`/api/admin/invoices/vendors`** | method suggestions read `bank_accounts`, not `invoice_payments` | small |
| **Platform booking money panel** | gains a **payment history** list instead of one scalar; Samuel's two deposits finally render as two rows | medium |
| **Direct booking / guest portal** | schedule rendered from `payments` by `slot`; portal is guest-facing, so change it **after** the admin side is proven | medium |
| **Reconciliation surface** — new | by account and date range: money in and out, running balance, matched vs unmatched. **This is the actual deliverable**; everything above is the plumbing it needs | large |

### Suggested build order

1. **Schema** — `bank_accounts` + `payments`, seeded, nothing reading them.
2. **Migration** — backfill, verify the five checks, still nothing reading them.
3. **Writes** — payment logging gains account + reference.
4. **Reads** — invoice panel, then platform booking history.
5. **The reconciliation surface** — the point of the exercise.
6. **Portal + deprecations** — last, and only once 1–5 are proven.

Each stage shown and verified before the next. Nothing deployed without approval.


---

# Stage 2 — executed 2026-08-26

**25 rows inserted: 21 `out`, 4 `in`.** Nothing was written to any existing table.

| check | result |
|---|---|
| count / split | 25 · 21 out · 4 in ✓ |
| out sum | $17,173.00 = `invoice_payments` ✓ |
| Samuel in | $7,242.30 = his `payout_amount` ✓ |
| RS-1002 in | $4,800.00 = the booking total ✓ |
| one-parent constraint | 0 violations across 25 ✓ |
| booking parents exist | 4/4, verified by query ✓ |
| `invoice_payments` SHA | `574ccb2dc359…` — **identical** ✓ |
| `calendar_blocks` SHA | `5540dc2a141a…` — **identical** ✓ |
| `bookings` SHA | `605c403f5c3a…` — **identical** ✓ |
| `amount_paid` | still 10 rows set, Samuel's still the stale 7,089.58 ✓ |
| Samuel's note | intact, word for word ✓ |

The migration is single-shot: the script aborts if `payments` is non-empty.

## Money by account — the question that could not be asked before

```
BMO Chequing         12 rows   in $7,242.30   out $14,104.00
Wealthsimple          7 rows   in     $0.00   out  $2,355.00
BMO Business          2 rows   in     $0.00   out    $339.00
no account            4 rows   in $4,800.00   out    $375.00
```

## Open — found during verification, not before

**RS-1002's two payments have no destination account.** $480.00 (2026-02-26) and
$4,320.00 (2026-06-28), both `etransfer`, both money **in** — and the
`bookings` table never recorded which account received them, because it has no
account column. They are not cash; they landed somewhere.

This is not a migration fault — the source data simply does not contain the fact.
But it is exactly the gap this build exists to close, and it means **the four
accountless rows are two different things**: the two cash payments are correctly
accountless, the two e-transfers are *unknown*. Worth distinguishing in the
reconciliation surface rather than showing one "no account" bucket.

**Needed: which account received RS-1002's deposit and final payment.** Once
answered they can be set directly, and the payment-logging UI in Stage 3 should
make the account mandatory for anything that is not cash.


---

# Stage 2b — `expense_created` and `source_payment_id`, run 2026-08-26

Found while scoping Stage 3: `expense_created` had not been migrated, and it is
**not derivable** from `expense_id`. One row — 2026-08-24, $2,000 — carries
`expense_created = true` with a null `expense_id`. Since that flag is what stops
an expense being filed twice, a read switching to `payments` without it would
have quietly lost the guard, with a duplicate expense as the failure mode.

`source_payment_id` was added in the same pass. Stage 2 stored no link back to
the source row, so the backfill needed a value join on
`(invoice_id, amount, paid_at, status)`. That join is 1:1 across all 21 rows —
but only just: `(invoice_id, amount)` alone collides **four** times, and one
collision is a planned/paid pair on the same invoice for the same $1,277 **whose
`expense_created` values are opposite**. A weaker key would have set the flag on
the wrong row.

| check | result |
|---|---|
| row-by-row flag copy | 21/21, **0 mismatches** ✓ |
| the underivable row | `true` with null `expense_id` — genuinely copied ✓ |
| `source_payment_id` populated | 21/21, **21 distinct**, all valid ✓ |
| `in` rows given a source | 0 ✓ |
| distribution | out 20 true / 1 false · in 0 / 4 ✓ |
| `payments` rows | still 25 ✓ |
| `invoice_payments` SHA | `574ccb2dc359…` — **identical** ✓ |

The unique partial index on `source_payment_id` was created *before* the
backfill, so an ambiguous join would have errored rather than mis-assigned. It
held, which means the 1:1 mapping is now guaranteed by the database rather than
inferred by a script.
