# Statement matching — rung 1

**Design only. Nothing built. Builds after stage 3 and after Jan–May is entered.**

Upload a bank statement for one account over one period, match its lines against
the payments already recorded, and surface what does **not** line up. The matches
are the boring part. The mismatches are the whole product:

- a statement **deposit with no payment** is income that was never recorded —
  RS-1002's two e-transfers, generalised into a question the system asks instead
  of one you have to remember to ask;
- a **payment with no statement line** is money you believed landed and which
  did not;
- everything else is quiet confirmation, which is what "reconciled" should mean
  and currently does not.

Rung 1 is match-and-flag. It never creates a payment, never edits one, never
deletes one.

## 1. Input format — CSV first

CSV, and PDF only if a bank turns out not to offer it. A CSV is already rows;
a PDF has to be extracted before it is rows, and the receipt extractor is the
standing evidence of what that costs — extraction is a source of errors that
sits *upstream* of the matching, so every matching bug becomes ambiguous.

**The exact column headers must be read off a real export before this is built,
not assumed.** Canadian bank exports vary by account type and by whether they
come from the web console or the mobile app, and the two accounts here are
different institutions. What is safe to design for is the shape, which is stable
across all of them:

| what it is | how it usually appears |
|---|---|
| date | one column, format varies (`YYYY-MM-DD`, `MM/DD/YYYY`, `DD-Mon-YY`) |
| description | one free-text column, sometimes two (a type and a memo) |
| amount | **either** one signed column, **or** separate debit and credit columns |
| balance | often present, ignored |

That last row is the one that bites: a single signed `amount` and a
`debit`/`credit` pair carry the same information in incompatible shapes, and
guessing wrong flips the direction of every line. So the importer takes a
**header mapping** — first upload of a given account asks which column is which,
remembers it per account, and reuses it. Mapping beats sniffing: it is visible,
correctable, and cannot silently mis-read next quarter's export when the bank
changes a heading.

Amounts are normalised to `direction` (`in`/`out`) plus a positive `amount`, the
same shape `payments` already uses, so nothing downstream has to think about
signs.

## 2. The match logic — proposals only

**This is the same attribute matching (amount + date) that once deleted a
sibling's expense.** That is the reason the whole feature is read-only at rung 1.
It proposes; you confirm. It is the receipt extractor's posture, not the
importer's.

Scoping first: a statement is **per account**, so a line only ever matches
payments with `account_id` = that account, inside the statement's period ± a few
days of slack at the edges. That single constraint removes most of the ambiguity
that made attribute matching dangerous elsewhere.

Then, per line:

| tier | rule | offered as |
|---|---|---|
| **confident** | same direction, exact amount, date within ±3 days, exactly one candidate | pre-ticked, still confirmable |
| **likely** | same direction, exact amount, date within ±14 days, exactly one candidate | offered, not pre-ticked |
| **weak** | exact amount but several candidates, or amount matches and date does not | listed as options, you choose |
| **none** | nothing | goes to the mismatch column, which is the point |

Two rules stop the plausible-but-wrong match:

- **Never auto-resolve ambiguity.** More than one candidate is *never* a
  confident match, however close the dates. Two identical amounts in one month is
  exactly the collision that produced the deleted expense.
- **One line, one payment.** A confirmed match consumes both sides, so a single
  payment cannot satisfy two statement lines.

Deliberately **not** matched on: description text. Bank memos are unreliable and
fuzzy string matching is how you get a confident-looking wrong answer. The
description is *shown* beside every proposal — a human reads it and decides —
and it is offered as fill for the payment's `reference` field, which 23 payments
still lack.

## 3. Where it lives

Money → **Reconcile**, beside Accounts rather than inside it. Upload, then three
columns:

```
  MATCHED                STATEMENT ONLY            SYSTEM ONLY
  quiet, collapsed       "income not recorded?"    "did this land?"
  n lines · $x           each with Assign →        each with the payment →
```

The middle column is the RS-1002 case, and its per-line action is the existing
**Assign** endpoint — which is why that stub exists. The right column links
straight to the payment so it can be corrected or deleted by hand.

## 4. What it writes

Two tables and one marker.

- `bank_statements` — one row per upload: `account_id`, `period_start`,
  `period_end`, `uploaded_at`, `file_path`, `opening_balance`, `closing_balance`,
  `line_count`. Unique on `(account_id, period_start, period_end)` so the same
  statement cannot be loaded twice and double-count.
- `statement_lines` — the normalised rows: `statement_id`, `posted_on`,
  `description`, `direction`, `amount`, `matched_payment_id`, `matched_at`,
  `matched_by`. The raw line is kept verbatim alongside the normalised fields, so
  a mapping mistake is diagnosable after the fact.
- On `payments`: **`reconciled_at`** and **`reconciled_statement_id`**. This is
  the honest "has the bank confirmed this?" signal the Accounts surface has never
  had. A balance built from payments nobody has checked against a statement looks
  exactly like one that has been checked, and today there is no way to tell them
  apart.

Confirming a match writes the marker on the payment and the link on the line, and
**nothing else** — no amount, no date, no account is ever changed by matching. If
a statement says $2,000 and the payment says $2,010, that is a mismatch to look
at, not a number to quietly correct.

Unmatching is allowed and clears both sides. Deleting a statement clears every
marker it set, so a bad import leaves nothing behind.

## 5. How it extends what exists

It sits on the payments/accounts foundation rather than beside it:

- **Accounts** gains a reconciled-through date per account and can distinguish
  bank-confirmed money from merely-recorded money.
- **The staleness banner** gets a real input: "BMO 0377 reconciled to 31 Aug"
  beats "last updated", because it says something about the books rather than
  about the page.
- **Assign** is the middle column's action, already stubbed for this.
- **`reference`** gets populated from statement descriptions, one confirmation at
  a time, closing the 23 blank ones as a side effect rather than as a chore.
- **`payments.account_id`** is the join key throughout, which is also why the
  RS-1002 rows were deliberately left `null` rather than guessed: an invented
  account would have produced a confident wrong match here.

## 6. Why it waits — the data-gap trigger

Run against today's data, a statement upload would report hundreds of unmatched
lines, and nearly all of them would be artefacts of Jan–May not being entered
rather than anything wrong. A tool whose output is mostly false alarms teaches
you to skim it, and the one real mismatch buried in the noise is exactly the one
this exists to catch.

**Build trigger: Jan–May entered and reconciled.** At that point an unmatched
line means something, and the three-column view is signal. Before that it is a
list of things you already know.
