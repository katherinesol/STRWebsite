-- Let a task say what created it, and what it is about.
--
-- THE TASK SYSTEM ALREADY EXISTS. maintenance_tasks holds nine live rows with a
-- cadence model, a completions table, an API and a page. What it cannot say is
-- "a machine raised this" or "this one is about that lock", and both are needed
-- the moment anything auto-creates a task: without them there is no way to ask
-- "is one already open for this?" and every run raises another.
--
-- SUBJECT_REF IS NOT OPTIONAL, and property_id will not do. Royal York West has
-- three locks — Apt 2, Apt 2 Emergency Exit and Royal Side — so a check keyed on
-- property alone would treat a flat battery in one as covering all three, and
-- the second and third would never raise a task at all.
--
-- IT HOLDS THE DEVICE, NOT THE LOCK ROW. Royal Side is one physical lock with a
-- row under royal-york-east and another under royal-york-west, sharing a
-- schlage_device_id — one lock, one battery, and keying on the row id would open
-- two tasks for one pair of batteries. The worker already groups by device for
-- exactly this reason.
--
-- DELIBERATELY NOT A FOREIGN KEY. subject_ref is meant to carry whatever a
-- future source is about — a booking, an invoice, a guest — and pinning it to
-- property_locks would make it a lock column rather than a subject column.
-- Source says how to read it.

alter table maintenance_tasks add column if not exists source      text not null default 'manual';
alter table maintenance_tasks add column if not exists subject_ref text;

-- A machine may raise a task; it may not invent a kind of task.
alter table maintenance_tasks drop constraint if exists maintenance_tasks_source_check;
alter table maintenance_tasks
  add constraint maintenance_tasks_source_check
  check (source in ('manual', 'battery'));

-- The duplicate guard, in the database rather than only in the caller: at most
-- one ACTIVE task per source per subject. A partial unique index, so completed
-- and dismissed history accumulates freely and only the live one is constrained
-- — the same shape as lock_actions_one_pending.
create unique index if not exists maintenance_tasks_one_open_per_subject
  on maintenance_tasks (source, subject_ref)
  where active and source <> 'manual' and subject_ref is not null;

notify pgrst, 'reload schema';

-- Returns rows, so "Success. No rows returned." means it did not run.
select 'column' kind, column_name name, coalesce(column_default,'-') detail
  from information_schema.columns
 where table_name = 'maintenance_tasks' and column_name in ('source','subject_ref')
union all
select 'index', indexname, 'partial: active, non-manual, subject set'
  from pg_indexes where indexname = 'maintenance_tasks_one_open_per_subject'
union all
select 'untouched rows', count(*)::text, 'existing tasks, all source=manual'
  from maintenance_tasks;
