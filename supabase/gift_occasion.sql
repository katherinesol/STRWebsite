-- Why a gift was given, alongside the note it explains.
--
-- Nullable text, no check constraint, on purpose. The list of occasions will
-- grow, and a constraint would make every addition another trip to the SQL
-- editor. The app owns the vocabulary instead — lib/gift-occasions.ts, enforced
-- by normaliseOccasion in the gift route, the same arrangement normaliseCategory
-- has for CRA expense categories. An unrecognised occasion becomes null rather
-- than being stored as typed, because an occasion is optional and a wrong one is
-- worse than none.
--
-- IT LIVES ON booking_gifts AND NOWHERE ELSE. Not on the booking, not on the
-- guest. The occasion is as revealing as the note: "anniversary" on a booking
-- row tells anyone glancing at the screen that a surprise is coming, which is
-- the whole thing the separate table exists to prevent. All three dashboards
-- select only booking_id from this table and use presence as a silent badge —
-- verified when this column was added, and it must stay that way.

alter table booking_gifts
  add column if not exists occasion text;

notify pgrst, 'reload schema';
