-- Cancellation, stage 2 -- the reversal figures a refund carries.
--
-- WHY THESE ARE STORED AND NOT DERIVED. The refund row records the cash that
-- left, which is the room reduction plus whatever tax the host was holding. From
-- that single number the room reduction cannot be recovered safely: the factor
-- depends on the MAT rate, on whether the stay was over 29 nights, on whether
-- apply_tax was on, and on the platform, and every one of those can be edited on
-- the booking afterwards. Inverting it would make a filed tax return depend on
-- arithmetic that quietly changes shape. This is the expense_created lesson
-- again -- a value that is not derivable must be written down.
--
-- refund_mat_yours IS THE ONE THE RETURNS READ, and it is not the same as
-- refund_mat_reversed. On Airbnb the MAT was collected and remitted by Airbnb,
-- so reversing it is Airbnb's to do and it must NOT come off the return the host
-- files -- netting it there would understate what is owed, which is the opposite
-- and worse error. So refund_mat_yours is the full reversal on VRBO, Houfy and
-- direct, and zero on Airbnb, decided at write time from the platform the
-- operator saw in the preview rather than re-derived later from a column that
-- may since have changed.

alter table payments
  add column if not exists refund_room_reduction numeric(12,2),
  add column if not exists refund_hst_reversed   numeric(12,2),
  add column if not exists refund_mat_reversed   numeric(12,2),
  add column if not exists refund_mat_yours      numeric(12,2);

-- Only a refund carries them, and a refund carries all four or none. A partly
-- filled refund row is one the returns would silently under-net.
alter table payments drop constraint if exists payments_refund_figures;
alter table payments add constraint payments_refund_figures check (
  (kind = 'refund'
     and refund_room_reduction is not null
     and refund_hst_reversed   is not null
     and refund_mat_reversed   is not null
     and refund_mat_yours      is not null)
  or (kind is distinct from 'refund'
     and refund_room_reduction is null
     and refund_hst_reversed   is null
     and refund_mat_reversed   is null
     and refund_mat_yours      is null)
);

-- The part you remit can never exceed the whole, and neither may be negative.
alter table payments drop constraint if exists payments_refund_mat_yours_sane;
alter table payments add constraint payments_refund_mat_yours_sane check (
  refund_mat_yours is null
  or (refund_mat_yours >= 0
      and refund_mat_reversed >= 0
      and refund_mat_yours <= refund_mat_reversed)
);

notify pgrst, 'reload schema';

-- Returns rows, so "Success. No rows returned." means it did not run.
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'payments'::regclass
   and conname in ('payments_refund_figures', 'payments_refund_mat_yours_sane')
union all
select 'columns present',
       string_agg(column_name, ', ' order by column_name)
  from information_schema.columns
 where table_name = 'payments'
   and column_name like 'refund\_%';
