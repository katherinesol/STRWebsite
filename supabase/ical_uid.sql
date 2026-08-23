-- Stable identity for synced bookings.
--
-- Identity was (property_id, start_date, end_date). Edit a booking's dates by hand
-- and the feed event no longer matches: the sync inserts a duplicate at the feed's
-- dates, then the reconcile pass sees the edited row as a stranger and reverts it.
-- Every iCal event carries a UID that survives a date change; the parser was simply
-- throwing it away.
--
-- Nullable, because rows already in the table were created before UIDs were stored
-- and there is no way to backfill them retroactively. The sync adopts a UID onto a
-- range-matched row the first time it sees one, so the table converges without a
-- migration.
--
-- The unique index is PARTIAL: it constrains only rows that have a uid, so the
-- pre-UID rows and manually created blocks are unaffected.

alter table calendar_blocks
  add column if not exists ical_uid text;

create unique index if not exists calendar_blocks_ical_uid_key
  on calendar_blocks (property_id, ical_uid)
  where ical_uid is not null;

comment on column calendar_blocks.ical_uid is
  'UID from the source iCal feed. Stable across date changes — this is what makes a manual date edit an edit rather than a new booking. Null for rows created before UID capture, and for manually created blocks.';
