-- Several people on one booking.
--
-- A booking is usually a family or a group, and any of them may need the door
-- code, the house guide or the concierge at 11pm. Until now only the lead
-- booker existed as a person and only the lead booker could get through the
-- guest gate; everyone else texted the lead, who texted the owner.
--
-- THE DISCRIMINATOR IS NOT NEW. `conversations` already carries booking_id plus
-- booking_kind to mean "a row belonging to a booking that might be direct or
-- platform", and create_booking_full speaks the same 'direct'|'platform'. A
-- third convention for the same idea would be one too many, so this borrows the
-- existing one — including the absence of a foreign key on booking_id, which is
-- the price of pointing at either bookings or calendar_blocks.
--
-- THE LEAD IS MIRRORED HERE, and that is a deliberate duplication. bookings
-- .guest_id and calendar_blocks.guest_id stay exactly as they are: around thirty
-- call sites read them and replacing that is an app-wide migration for no gain.
-- So guest_id remains the fast pointer to the lead, and this table is the
-- authority on the whole set, carrying a role='lead' row that repeats it.
--
-- Duplication drifts. This codebase proved it a day ago, when guests.name and
-- calendar_blocks.guest_name had quietly disagreed for three guests until a
-- migration reconciled them. So the mirror ships with the drift made hard
-- rather than merely discouraged:
--
--   * booking_guests_one_lead — a PARTIAL unique index, so "who is the lead"
--     can never become two answers. This is the line that makes the mirror
--     safe and it is not optional.
--   * a re-runnable consistency check, asserting every booking has exactly one
--     lead and that it equals the booking's own guest_id.
--   * merge_guests must repoint this table as it already repoints bookings,
--     calendar_blocks and conversations — otherwise a merge cascade-deletes the
--     absorbed guest's access. Owed, bundled with the create_booking_full
--     fixes.
--
-- ACCESS TOKENS ARE NOT HERE YET. Per-person links are step 3, and adding the
-- columns before the access model is agreed invites something to start writing
-- them.
--
-- RLS is enabled with no policies: deny by default. Every read in this app is
-- server-side through the service role, which bypasses RLS, so nothing breaks —
-- but if an anon client ever reaches this table it gets nothing. The real gate
-- is the API route, and a guest-facing read must select name and role only.
-- Email and phone live on guests and must never be reachable from a guest route.

create table if not exists booking_guests (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null,
  booking_kind  text not null check (booking_kind in ('direct','platform')),
  guest_id      uuid not null references guests(id) on delete cascade,
  role          text not null default 'co_guest' check (role in ('lead','co_guest')),
  added_at      timestamptz not null default now(),
  -- who granted this access: the host, or the lead guest adding their own party.
  -- Cheap to carry and impossible to reconstruct later.
  added_by      uuid,
  unique (booking_id, booking_kind, guest_id)
);

create index if not exists booking_guests_booking_idx
  on booking_guests (booking_id, booking_kind);
create index if not exists booking_guests_guest_idx
  on booking_guests (guest_id);

-- exactly one lead per booking, enforced rather than assumed
create unique index if not exists booking_guests_one_lead
  on booking_guests (booking_id, booking_kind) where role = 'lead';

alter table booking_guests enable row level security;

notify pgrst, 'reload schema';
