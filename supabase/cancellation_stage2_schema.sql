-- Cancellation, stage 2 -- schema.
--
-- Two changes, both touching guarantees that sit on real money, so each is
-- stated in full rather than patched.
--
-- WHAT WAS INSTALLED, read from the database on 2026-08-27 with STEP 0 below.
-- payments.kind and the relax that admitted standalone income were applied but
-- never recorded in supabase/payments.sql, so that file does not describe what
-- is running. The live text was:
--
--   payments_kind_check   CHECK (kind = ANY (ARRAY['damage_recovery','insurance',
--                                                  'refund_received','other']))
--
--   payments_one_parent   CHECK ((invoice_id is not null and booking_id is null
--                                 and booking_kind is null and kind is null)
--                             or (invoice_id is null and booking_id is not null
--                                 and booking_kind is not null and kind is null)
--                             or (invoice_id is null and booking_id is null
--                                 and booking_kind is null and kind is not null
--                                 and direction = 'in'))
--
--   calendar_blocks_property_start   a bare UNIQUE INDEX on (property_id,
--                                    start_date), not a table constraint
--
-- ONE DIFFERENCE WORTH NAMING. payments_kind_check has no 'kind is null' clause.
-- A null kind passes it by three-valued logic -- null = any(...) is null, and a
-- CHECK fails only on false -- rather than by permission. The replacement below
-- says 'kind is null or kind in (...)', which is equivalent on every input and
-- makes the null case deliberate instead of incidental.

-- ═══ STEP 0 -- inspect. Run this alone, first, and read the output. ═══

select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'payments'::regclass
   and conname in ('payments_one_parent', 'payments_kind_check')
union all
select indexname, indexdef
  from pg_indexes
 where tablename = 'calendar_blocks'
   and indexname like '%property_start%';


-- ═══ STEP 1 -- migrate. Run only after STEP 0 matches. ═══

begin;

-- ── (a) the must-fix: a cancelled row must not reserve its slot ────────────
--
-- calendar_blocks carries unique (property_id, start_date). A cancelled row
-- still occupies that slot, so cancel-then-rebook -- the same property, the same
-- check-in date, which is the ordinary reason anyone cancels -- fails on a
-- constraint violation while every read path reports the dates as free. The
-- dates say yes and the insert says no.
--
-- A partial index is the fix, and it has to be an INDEX: Postgres has no partial
-- UNIQUE constraint. The old object is dropped both ways because it may have
-- been created either as a table constraint or as a bare index, and only one of
-- those two statements will match. Both are if-exists, so the other is a no-op.
--
-- The new name says what changed. Duplicate-key errors will now cite
-- calendar_blocks_property_start_live rather than the old name.
--
-- Wrapped in a transaction so there is no window in which the table sits with no
-- uniqueness guarantee at all.

alter table calendar_blocks drop constraint if exists calendar_blocks_property_start;
drop index if exists calendar_blocks_property_start;

create unique index calendar_blocks_property_start_live
  on calendar_blocks (property_id, start_date)
  where status <> 'cancelled';

-- ── (b) let a refund be a payment ─────────────────────────────────────────
--
-- A refund is money leaving for a booking: direction 'out', booking parent,
-- kind 'refund'. Today every one of those three together is refused -- 'refund'
-- is not in the kind allowlist, and a parented row may carry no kind at all.
--
-- 'refund' vs 'refund_received' are opposite directions and both are needed:
-- refund_received is money that came back TO the business and is standalone
-- income; refund is money going OUT to a guest against a booking. Neither may
-- stand in for the other, which is why the two new clauses pin direction.
--
-- TWO CLAUSES ARE TIGHTER THAN WHAT IS INSTALLED, deliberately. Adding 'refund'
-- to the allowlist would otherwise make it legal in places it must never appear:
-- on an invoice, and as standalone income. The invoice clause already required
-- kind is null (probed), so that is unchanged in effect; the standalone clause
-- gains 'and kind <> refund', which is new. All 28 existing rows were checked
-- against the predicate below before this was written: 21 invoice rows, 4
-- booking rows, 3 standalone damage_recovery rows, none of which it refuses.

alter table payments drop constraint if exists payments_kind_check;
alter table payments add constraint payments_kind_check check (
  kind is null
  or kind in ('damage_recovery', 'insurance', 'refund_received', 'other', 'refund')
);

alter table payments drop constraint if exists payments_one_parent;
alter table payments add constraint payments_one_parent check (
  -- an invoice payment
  (invoice_id is not null and booking_id is null and booking_kind is null
   and kind is null)
  -- an ordinary booking payment
  or (invoice_id is null and booking_id is not null and booking_kind is not null
      and kind is null)
  -- a refund against a booking: money out, and the only kind a parented row may
  -- carry
  or (invoice_id is null and booking_id is not null and booking_kind is not null
      and direction = 'out' and kind = 'refund')
  -- standalone non-booking income: money in, and never a refund, which is out
  or (invoice_id is null and booking_id is null and booking_kind is null
      and direction = 'in' and kind is not null and kind <> 'refund')
);

-- PostgREST caches the schema per role and will keep enforcing the old shape
-- from cache until told otherwise.
notify pgrst, 'reload schema';

commit;


-- ═══ STEP 2 -- verify. Returns rows, so "Success. No rows returned." means
--     something above did not run. ═══

select 'index' as object,
       indexname as name,
       indexdef as definition
  from pg_indexes
 where tablename = 'calendar_blocks'
   and indexname = 'calendar_blocks_property_start_live'
union all
select 'constraint',
       conname,
       pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'payments'::regclass
   and conname in ('payments_one_parent', 'payments_kind_check')
union all
select 'old index gone',
       'calendar_blocks_property_start',
       case when exists (
         select 1 from pg_indexes
          where tablename = 'calendar_blocks'
            and indexname = 'calendar_blocks_property_start'
       ) then 'STILL PRESENT - the drop did not run' else 'dropped' end;
