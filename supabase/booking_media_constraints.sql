-- Pre-arrival photo walkthrough, step 1 -- pin the vocabulary.
--
-- booking_media was created with neither column constrained, and a probe against
-- the live table accepted tag = 'banana', tag = '' and tag = 'DROP TABLE', plus
-- media_type = 'pdf'. The 'after' default is a hint about intent and nothing
-- more.
--
-- THIS RUNS BEFORE ANY UI EXISTS, on purpose. The table currently holds zero
-- rows, so there is nothing to migrate and nothing to clean up; a constraint
-- added later would have to reckon with whatever the UI had already written. A
-- rule enforced only in the UI is a convention, and this table is about to hold
-- the evidence a damage claim is argued from.
--
-- THREE TAGS, NOT TWO. 'before' and 'after' carry the comparison the feature
-- exists for. 'issue' is the shot taken mid-stay when something is found, which
-- would otherwise be filed as 'after' and quietly pollute the departure set that
-- a claim is measured against.

alter table booking_media
  drop constraint if exists booking_media_tag_check;
alter table booking_media
  add constraint booking_media_tag_check
  check (tag in ('before', 'after', 'issue'));

alter table booking_media
  drop constraint if exists booking_media_type_check;
alter table booking_media
  add constraint booking_media_type_check
  check (media_type in ('photo', 'video'));

notify pgrst, 'reload schema';

-- Returns rows, so "Success. No rows returned." means it did not run.
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'booking_media'::regclass
   and conname in ('booking_media_tag_check', 'booking_media_type_check')
 order by conname;
