-- Split guests.name into first_name + last_name.
--
-- STEP 1 OF 5, and the only step that needs a hand in the SQL editor — the
-- service role cannot run DDL through PostgREST. Steps 2 to 4 (backfill,
-- the three confirmed corrections, and the consistency check) are applied by
-- the app against the plan reviewed on 2026-08-24.
--
-- `name` IS DELIBERATELY KEPT. Around thirty call sites read it — the legacy
-- admin pages, the keyholder People and income screens, the guest matcher, the
-- figures endpoints, the access-code and portal-link emails, and the guest
-- verification gate. Keeping it populated means none of them need touching, and
-- it stays the audit of what the record said before the split. Making it
-- generated would put every one of those call sites in scope.
--
-- Both columns are nullable on purpose. A NOT NULL here would have to be
-- satisfied at creation time, before the backfill has been reviewed, which is
-- exactly the pressure that turns a doubtful split into a permanent one.
--
-- WHAT THIS DOES NOT DO: nothing reads first_name or last_name after this runs.
-- Verification still matches any token of `name`. Switching it to last_name is
-- step 5, a separate deploy held until the backfill has been reviewed — because
-- a wrong split that nobody reads is a typo, and a wrong split behind the
-- verification gate is a guest locked out of their door code at 11pm.

alter table guests
  add column if not exists first_name text,
  add column if not exists last_name  text;

notify pgrst, 'reload schema';
