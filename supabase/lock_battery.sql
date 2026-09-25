-- Battery level per lock, read off the hardware by the worker.
--
-- NOT FROM SEAM. locks/discover surfaced d.properties.battery_level, and the
-- Seam account is dead in both directions — its API key answers 401 and its
-- webhook stopped delivering on 23 September. pyschlage exposes battery_level
-- directly and schlage-bulk.py has been printing it for weeks; the worker is
-- already logged into the account every run, so this costs one attribute read.
--
-- TWO COLUMNS, NOT ONE. A battery reading with no timestamp cannot be told from
-- a stale one, and this is a number whose whole meaning is how recently it was
-- true. If the worker stops running -- which it did, for fourteen days -- a
-- healthy-looking 80% from a fortnight ago is worse than no reading at all.
-- battery_checked_at is what lets the page say "80%, a fortnight ago" instead.

alter table property_locks add column if not exists battery_level     integer;
alter table property_locks add column if not exists battery_checked_at timestamptz;

alter table property_locks drop constraint if exists property_locks_battery_check;
alter table property_locks
  add constraint property_locks_battery_check
  check (battery_level is null or battery_level between 0 and 100);

notify pgrst, 'reload schema';

-- Returns rows, so "Success. No rows returned." means it did not run.
select column_name, data_type
  from information_schema.columns
 where table_name = 'property_locks'
   and column_name in ('battery_level', 'battery_checked_at')
 order by column_name;
