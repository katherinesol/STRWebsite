-- ═══════════════════════════════════════════════════════════════════════════
-- PAYMENT RECONCILIATION — STAGE 1: SCHEMA ONLY
--
-- Adds two tables and seeds three accounts. Copies nothing, reads nothing,
-- changes no existing row. invoice_payments, calendar_blocks and bookings are
-- not referenced by this file at all — Stage 2 does the migration, separately
-- and after its own approval.
--
-- Safe to re-run: every statement is idempotent.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── bank_accounts ──────────────────────────────────────────────────────────
-- The real accounts money actually moves through, so a payment can point at one
-- instead of carrying a free-text label. Today invoice_payments.method_detail is
-- prose, and the chip UI derives its suggestions from those same rows — a
-- self-referential loop, which is how "BMO Business " kept a trailing space
-- across every payment logged with it. Seeded clean here.
--
-- There is deliberately NO cash account. A cash payment gets account_id null,
-- which is the truth; inventing an account for it would make cash look like it
-- landed in a bank.
create table if not exists bank_accounts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  institution  text not null,
  last4        text,
  kind         text not null default 'chequing'
                 check (kind in ('chequing','savings','credit','cash','other')),
  currency     text not null default 'CAD',
  active       boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

-- One account per institution+last4. Partial, because an account without a
-- recorded last4 should not collide with another one.
create unique index if not exists bank_accounts_institution_last4_uniq
  on bank_accounts (institution, last4) where last4 is not null;


-- ── payments ───────────────────────────────────────────────────────────────
-- One table for money in and money out.
--
-- Two tables would have been the easier build and the wrong answer: the whole
-- point is to ask "what hit BMO 0377 in July" and get ONE result. Split across
-- an invoice-payments table and a booking-payments table, that question needs
-- two queries and a merge, which is the problem this is meant to end.
--
-- booking_id + booking_kind mirrors booking_guests exactly. That table already
-- answers "this row belongs to either a direct booking or a platform booking"
-- in this database; a second convention for the same problem would be one to
-- remember and get wrong. There is no FK on booking_id for that reason — it
-- addresses two tables — so Stage 2 verifies parentage by query, as
-- booking_guests does.
--
-- `slot` keeps what the bookings table's deposit/second/final COLUMNS meant,
-- without inheriting their cap of three. A stay can take a fourth payment or a
-- partial one and still label the scheduled three.
create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  direction     text not null check (direction in ('in','out')),

  -- exactly one parent, enforced below
  invoice_id    uuid references invoices(id) on delete cascade,
  booking_id    uuid,
  booking_kind  text check (booking_kind in ('direct','platform')),

  amount        numeric(12,2) not null,
  currency      text not null default 'CAD',
  status        text not null default 'paid'
                  check (status in ('planned','paid','failed','refunded')),
  paid_at       timestamptz,
  due_date      date,

  method        text,
  account_id    uuid references bank_accounts(id) on delete restrict,
  reference     text,
  slot          text check (slot in ('deposit','second','final','other')),

  note          text,
  expense_id    uuid references expenses(id) on delete set null,
  created_at    timestamptz not null default now(),
  created_by    uuid,

  -- an invoice payment or a booking payment, never both and never neither
  constraint payments_one_parent check (
    (invoice_id is not null and booking_id is null and booking_kind is null)
    or (invoice_id is null and booking_id is not null and booking_kind is not null)
  ),

  -- a payment that has been made has a date it was made on. The 'planned' row
  -- carried over from invoice_payments has no paid_at, which this allows.
  constraint payments_paid_has_date check (status <> 'paid' or paid_at is not null),

  -- on_delete restrict above stops an account being removed out from under a
  -- payment; deactivate it instead (active = false).
  constraint payments_amount_nonzero check (amount <> 0)
);

create index if not exists payments_invoice_idx  on payments (invoice_id);
create index if not exists payments_booking_idx  on payments (booking_id, booking_kind);
-- the reconciliation surface's main question: one account, one date range
create index if not exists payments_account_date_idx on payments (account_id, paid_at desc);
create index if not exists payments_paid_at_idx   on payments (paid_at desc);


-- ── RLS: deny by default, same as booking_guests ───────────────────────────
-- Enabled with no policies, so anon and authenticated can read nothing. The
-- server reaches these through the service role, which bypasses RLS. This is
-- money data; it should never be reachable from a browser session directly.
alter table bank_accounts enable row level security;
alter table payments      enable row level security;


-- ── seed the three real accounts ───────────────────────────────────────────
-- Names stored clean. "BMO Business " loses its trailing space here, which is
-- why Stage 2 matches on trim(method_detail) rather than the raw value.
insert into bank_accounts (name, institution, last4, kind, sort_order) values
  ('BMO Chequing',      'BMO',          '0377', 'chequing', 1),
  ('Wealthsimple',      'Wealthsimple', '5836', 'chequing', 2),
  ('BMO Business',      'BMO Business', '8671', 'chequing', 3)
on conflict do nothing;


-- ═══════════════════════════════════════════════════════════════════════════
-- STAGE 2b — expense_created, and the provenance column Stage 2 should have had
--
-- Run 2026-08-26, after the migration. Two problems, one block.
--
-- expense_created was missed in the Stage 2 mapping and is NOT derivable from
-- expense_id: one row (2026-08-24, $2,000) carries expense_created = true with a
-- null expense_id. It is the guard against filing the same expense twice, so a
-- read switching to payments without it would silently lose that protection —
-- the failure mode being a duplicate expense in the books.
--
-- source_payment_id is the column Stage 2 should have written. Without it the
-- backfill below needs a four-column value join, which worked but is fragile:
-- (invoice_id, amount) alone collides four times, and one of those collisions is
-- a planned/paid pair on the same invoice for the same $1,277 whose
-- expense_created values are OPPOSITE. Only paid_at and status separate them.
-- Storing the id makes every future backfill trivial and auditable.
--
-- The unique index is created BEFORE the backfill deliberately: if the value
-- join were ambiguous, two payments rows would receive the same source id and
-- the UPDATE would error rather than silently mis-assign.
--
-- `at time zone 'UTC'` is not optional. invoice_payments.paid_at is a DATE while
-- payments.paid_at is a TIMESTAMPTZ at midnight UTC; a bare ::date cast resolves
-- in the session timezone, so in America/Toronto every row shifts a day back and
-- matches nothing.
-- ═══════════════════════════════════════════════════════════════════════════

alter table payments
  add column if not exists expense_created   boolean not null default false,
  add column if not exists source_payment_id uuid references invoice_payments(id);

create unique index if not exists payments_source_payment_uniq
  on payments (source_payment_id) where source_payment_id is not null;

update payments p
set    source_payment_id = ip.id
from   invoice_payments ip
where  p.direction = 'out'
  and  p.source_payment_id is null
  and  p.invoice_id = ip.invoice_id
  and  p.amount     = ip.amount
  and  p.status     = ip.status
  and  (p.paid_at at time zone 'UTC')::date is not distinct from ip.paid_at;

update payments p
set    expense_created = ip.expense_created
from   invoice_payments ip
where  p.source_payment_id = ip.id;


-- ═══════════════════════════════════════════════════════════════════════════
-- STAGE 4a — the account-assignment invariant, enforced in the database
--
-- Twenty-one payments were copied from invoice_payments and still carry
-- source_payment_id. For those rows the account of record lives in
-- invoice_payments.method_last4, because the invoice panel still writes there
-- and nothing has switched. Changing account_id on such a row would leave the
-- two disagreeing with no way to tell which was right.
--
-- The assign endpoint already refuses them. This exists because an invariant
-- about money should not rest on every future caller remembering it — a script,
-- a console session or a later endpoint would bypass the check and nothing
-- would notice. Here it is impossible rather than discouraged.
--
-- A CHECK constraint cannot express this: it sees only the candidate row, not
-- whether the UPDATE changed account_id, so it would also reject the untouched
-- rows it is meant to leave alone. Hence a BEFORE UPDATE trigger.
--
-- INSERT is deliberately NOT guarded. Stage 2 legitimately inserted mirrored
-- rows with both source_payment_id and account_id set; blocking that would have
-- made the migration itself impossible. Only later CHANGES are refused.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function payments_block_account_change_on_mirrored()
returns trigger
language plpgsql
as $$
begin
  if new.source_payment_id is not null
     and new.account_id is distinct from old.account_id then
    raise exception
      'account_id cannot be changed on a payment mirrored from invoice_payments (source_payment_id %). Its account of record is invoice_payments.method_last4 until the invoice read/write switch.',
      new.source_payment_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_account_guard on payments;
create trigger payments_account_guard
  before update on payments
  for each row
  execute function payments_block_account_change_on_mirrored();
