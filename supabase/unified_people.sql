-- ═════════════════════════════════════════════════════════════════════════════
-- One people table: guests and contractors in the same record.
--
-- A cleaner who once stayed is one human being. Two tables for them is the
-- duplicate problem `guests` already demonstrates — two Molhem records, ten rows
-- flagged returning when one guest has actually returned — reproduced across a
-- table boundary where no merge tool can reach it.
--
-- TWO BOOLEANS, NOT AN ENUM. A contact_type enum forces 'both' as a third value
-- that every filter has to remember, and turns "does any contracting" into a
-- string comparison. Two flags answer it directly, and the only invalid
-- combination is refused by a constraint rather than by convention.
--
-- is_guest DEFAULTS TRUE so all 48 existing rows behave exactly as they did
-- yesterday. Nothing about the guest surface changes on day one.
--
-- SINGLE email AND phone, DELIBERATELY. The old contacts table held arrays. The
-- guest verification gate matches on guests.email, and a second address raises a
-- question the gate cannot answer — which one counts? A contractor's second
-- number goes in contractor_notes, which is prose and makes no such promise.
-- ═════════════════════════════════════════════════════════════════════════════

alter table guests
  add column if not exists is_guest      boolean not null default true,
  add column if not exists is_contractor boolean not null default false,
  -- `contacts.role` by a better name: the thing you search for when a pipe bursts
  add column if not exists trade             text,
  add column if not exists properties_served text[],
  -- kept apart from `notes`, which a guest-facing surface may one day render
  add column if not exists contractor_notes  text;

do $$ begin
  alter table guests add constraint guests_has_a_role check (is_guest or is_contractor);
exception when duplicate_object then null; end $$;

comment on column guests.is_contractor is
  'Someone who works on the properties. Independent of is_guest — a person can be both, and that is the case this design exists for.';
comment on column guests.properties_served is
  'Property ids a contractor covers. Validated in the API against the real properties; Nickel Beach is ninety minutes from Royal York and that matters at 7am.';

notify pgrst, 'reload schema';
