-- Stage 3: stop a lock row taking the queue with it, and drop the fiction.
--
-- ON DELETE RESTRICT, NOT CASCADE. lock_actions.lock_id cascaded, so deleting a
-- property_locks row silently deleted every pending intent attached to it.
-- Nothing would have shown an intent had ever existed: no failed row, no alert,
-- no gap in a list — the guests simply never get coded, and the first symptom is
-- somebody at a door. That is the single sharpest edge on the lock editor, and
-- it is closed in the database rather than in a handler, because a handler can
-- be bypassed by the next script anybody writes against this table.
--
-- The readable refusal lives in the route. This constraint is what makes the
-- refusal true rather than merely polite.
alter table lock_actions drop constraint if exists lock_actions_lock_id_fkey;
alter table lock_actions
  add constraint lock_actions_lock_id_fkey
  foreign key (lock_id) references property_locks(id) on delete restrict;

-- property_settings.schlage_devices was never real. Six entries across three
-- properties, every device_id the empty string, names ("Front door", "Suite
-- door", "Storage") matching no lock this account has, and ids (lock_rye_1)
-- referenced nowhere in the codebase or the database. Nothing operational ever
-- read it: not lock-queue, not queue_lock_action, not the sweep, not the cron,
-- not the worker. Its only reader was an editor that was itself orphaned.
--
-- Dropped rather than left. A column that looks like configuration and governs
-- nothing is worse than an absent one — it invites somebody to fix the locks by
-- filling it in.
alter table property_settings drop column if exists schlage_devices;

notify pgrst, 'reload schema';

-- Returns rows, so "Success. No rows returned." means it did not run.
select 'fk' as kind, conname as name, pg_get_constraintdef(oid) as detail
  from pg_constraint where conname = 'lock_actions_lock_id_fkey'
union all
select 'column gone', 'schlage_devices',
       case when exists (select 1 from information_schema.columns
                          where table_name='property_settings' and column_name='schlage_devices')
            then 'STILL PRESENT' else 'dropped' end;
