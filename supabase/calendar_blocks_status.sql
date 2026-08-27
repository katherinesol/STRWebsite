-- Cancellation, stage ① — calendar_blocks gains a status.
--
-- Applied to the live database on 2026-08-27 through the Supabase SQL editor.
-- The columns below were then read back from the database, not from this file:
-- status is NOT NULL DEFAULT 'confirmed', a non-member value ('pending') is
-- refused by the check constraint, NULL is refused by the NOT NULL, and
-- 'cancelled' is accepted together with cancelled_at and cancellation_reason.
--
-- A CANCELLED BOOKING IS REVERSED, NEVER DELETED. The row keeps its dates, its
-- guest and every figure on it, because the money has to stay auditable — what
-- changes is that twenty-nine read paths stop counting it. Deleting the row
-- would destroy a real financial record and take the reversal with it.
--
-- WHAT THIS DOES NOT DO. No money is reversed here and no tax is recomputed;
-- that is stage ②. No dates are freed at the platform and no lock code is
-- revoked; that is stage ③. This stage only adds the column, backfills it and
-- teaches the read paths to respect it.

alter table calendar_blocks
  add column if not exists status text not null default 'confirmed',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

-- Every row that existed before this migration is a live booking or block.
update calendar_blocks set status = 'confirmed' where status is null;

alter table calendar_blocks
  drop constraint if exists calendar_blocks_status_check;
alter table calendar_blocks
  add constraint calendar_blocks_status_check
  check (status in ('confirmed', 'cancelled'));

-- PostgREST caches the schema per role and will keep reporting the column as
-- absent until told otherwise. Without this the sweep looks like it failed.
notify pgrst, 'reload schema';

-- Self-check: returns a row, so "Success. No rows returned." means it did not run.
select count(*) as total_rows,
       count(*) filter (where status = 'confirmed') as confirmed,
       count(*) filter (where status = 'cancelled') as cancelled,
       count(*) filter (where is_booking and status = 'confirmed') as bookings_confirmed
  from calendar_blocks;
