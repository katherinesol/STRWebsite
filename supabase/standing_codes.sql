-- Codes that belong to a person rather than a stay.
--
-- WHY A TABLE AND NOT A staff_access ROW FOR EVERYTHING. staff_access models a
-- GRANT: a person given access for a window, with starts_at, ends_at, an
-- access_type and the locks it covers. That is the right shape for a cleaner or
-- an electrician. It is the wrong shape for the owner's own master, which is
-- not granted, does not expire, and is not revocable in the sense the rest of
-- that table means. Forcing it in would make every query over staff_access have
-- to remember one row is not like the others.
--
-- WHAT THIS FIXES. door.entry has logged "opened with an unrecognised code" 112
-- times since July for a code that is simply Katherine's, because match_code()
-- in the worker only ever compares against bookings. Curtis's electrician code
-- has sat in staff_access since 29 July and has never once been recognised for
-- the same reason. An alert that fires on known-good activity is an alert
-- people learn to scroll past, and the whole value of "unrecognised" is that it
-- should be rare enough to look at.
--
-- THE FULL CODE, NOT THE LAST FOUR. The Seam webhook stored slice(-4), so
-- Katherine's 8-digit master appears as "3109" in 112 rows while the worker,
-- which stores codes whole, logged it once as "25213109". Matching has to be
-- against what is actually on the lock, so this column holds the whole thing
-- and the worker compares both the full string and its last four.

create table if not exists standing_codes (
  id         uuid primary key default gen_random_uuid(),
  code       text not null,
  label      text not null,
  kind       text not null check (kind in ('owner', 'partner', 'staff', 'contractor')),
  note       text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists standing_codes_code_active
  on standing_codes (code) where active;

alter table standing_codes enable row level security;

notify pgrst, 'reload schema';

-- Returns rows, so "Success. No rows returned." means it did not run.
select column_name, data_type from information_schema.columns
 where table_name = 'standing_codes' order by ordinal_position;
