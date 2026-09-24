-- Damage reports: reconcile the table with the code that writes to it.
--
-- WHAT WAS ACTUALLY WRONG. /api/admin/damage POST inserts item, location,
-- photo_urls, amount_claimed and linked_to_deposit. The live table has none of
-- those five columns. Every submission since the form shipped has failed with
--
--     ERROR: 42703: column "item" of relation "damage_reports" does not exist
--
-- and DamageReportForm.tsx wraps the fetch in `catch {}` and then routes to the
-- list regardless, so the failure was invisible: you fill the form, you press
-- Submit, you land on a page that says "No damage reports", and nothing
-- anywhere says the write was refused. damage_reports holds 0 rows and that is
-- not because nothing was ever damaged.
--
-- So the answer to "does it log photos" is narrower than it sounds: it does not
-- log anything. Photos were never the missing half.
--
-- THE COLUMN NAME IS `room`, NOT `location`. damage_items -- the catalogue this
-- table already has a foreign key into -- calls it `room`. Two words for one
-- idea in two tables that join is how a query ends up written against the wrong
-- one. The API is changed to match the database rather than the reverse.
--
-- item_id STAYS AND STAYS NULLABLE. /admin/inventory and damage_items are the
-- same idea built twice; which survives is not settled, so the catalogue key is
-- kept as the join it already is and free text carries the load today. A report
-- filed as text now can be pointed at a catalogue row later. The reverse -- a
-- required key into a catalogue nobody maintains -- forces the person filing at
-- 11pm to invent an inventory first.
--
-- NO photo_urls COLUMN. Photos attach through booking_media.report_id, which
-- already exists and was never wired. A jsonb array of URLs would be a second,
-- weaker media system beside the one that already has signed uploads, a
-- captured_at taken from the shutter rather than the clock, a tag constraint,
-- and a delete rule that lets a cleaner add evidence and not remove it. It
-- would also have to hold URLs for a private bucket, which are either signed
-- and expire in an hour or unsigned and do not work.

alter table damage_reports add column if not exists item             text;
alter table damage_reports add column if not exists room             text;
alter table damage_reports add column if not exists amount_claimed   numeric(10,2);
alter table damage_reports add column if not exists linked_to_deposit boolean not null default false;

-- Safe as an unconditional NOT NULL only because the table is empty; verified
-- above rather than assumed. A report with no item is not a report.
alter table damage_reports alter column item set not null;

alter table damage_reports drop constraint if exists damage_reports_status_check;
alter table damage_reports
  add constraint damage_reports_status_check
  check (status in ('pending', 'approved', 'fixed', 'dismissed'));

alter table damage_reports drop constraint if exists damage_reports_kind_check;
alter table damage_reports
  add constraint damage_reports_kind_check
  check (booking_kind is null or booking_kind in ('direct', 'platform'));

alter table damage_reports drop constraint if exists damage_reports_amount_check;
alter table damage_reports
  add constraint damage_reports_amount_check
  check (amount_claimed is null or amount_claimed >= 0);

-- THE MISSING FK. booking_media.report_id has existed as a bare uuid since the
-- table was created and pointed at nothing, so a typo'd id was a silently
-- orphaned photo.
--
-- ON DELETE SET NULL, NOT CASCADE, and the distinction is the whole reason to
-- write the constraint by hand. The photo documents the STAY; the report is a
-- claim made about it. Withdrawing the claim must not destroy the evidence --
-- including the evidence that the claim was wrong. The photo falls back to
-- being an ordinary walkthrough shot, which is what it was before anyone
-- attached it.
alter table booking_media drop constraint if exists booking_media_report_id_fkey;
alter table booking_media
  add constraint booking_media_report_id_fkey
  foreign key (report_id) references damage_reports(id) on delete set null;

create index if not exists damage_reports_booking_idx  on damage_reports (booking_id);
create index if not exists damage_reports_property_idx on damage_reports (property_id, status);
create index if not exists damage_reports_logged_idx   on damage_reports (logged_at desc);
create index if not exists booking_media_report_idx    on booking_media (report_id) where report_id is not null;

notify pgrst, 'reload schema';

-- Returns rows, so "Success. No rows returned." means it did not run.
select 'column' as kind, column_name as name, data_type as detail
  from information_schema.columns
 where table_name = 'damage_reports'
   and column_name in ('item', 'room', 'amount_claimed', 'linked_to_deposit', 'item_id')
union all
select 'constraint', conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conname in ('damage_reports_status_check', 'damage_reports_kind_check',
                   'damage_reports_amount_check', 'booking_media_report_id_fkey')
 order by 1, 2;
