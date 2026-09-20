-- ═════════════════════════════════════════════════════════════════════════════
-- Returning-guest milestones: flag, never act.
--
-- THE COUNT STAYS DERIVED. guestStats() counts TRIPS from both booking tables
-- and collapses rows that run into each other at the same property, because
-- Amanda's VRBO 14-16 August followed by Houfy 16-17 is one visit that changed
-- platform mid-stay, not a guest who came back. A stored counter would drift
-- from that the first time a booking was edited, and the guests table already
-- carries the evidence: `returning_guest` is true on ten rows and only one of
-- them has actually returned. A flag that can disagree with the bookings will
-- eventually disagree with the bookings, so the number is never stored.
--
-- prior_stays IS THE ONE MANUAL PART, and only because the system genuinely
-- cannot know it: stays that happened before any of this existed. It is added,
-- not counted, and it is the only figure Kaye types.
--
--     loyalty total = derived trips + prior_stays
--
-- MILESTONES ARE DATA, NOT CODE. Hard-coding 5 and 10 means a change is a
-- deploy. They live in a table Kaye can edit.
--
-- NOTHING IS EVER AUTOMATICALLY GIVEN. Crossing a threshold raises a flag and
-- stops. Kaye decides what the gift is, every time — the system's job is to
-- make sure she knows, not to decide on her behalf.
-- ═════════════════════════════════════════════════════════════════════════════

alter table guests
  add column if not exists prior_stays integer not null default 0
    check (prior_stays >= 0 and prior_stays <= 200);

comment on column guests.prior_stays is
  'Stays from BEFORE this system existed. Added to the derived trip count; the derived part is never stored.';


create table if not exists loyalty_milestones (
  stays      integer primary key check (stays > 0 and stays <= 200),
  label      text not null,
  note       text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table loyalty_milestones is
  'Editable thresholds. Crossing one raises a flag for Kaye — it never applies a perk.';

insert into loyalty_milestones (stays, label, note) values
  (3,  'Third stay',   'Worth a note — they have chosen you three times.'),
  (5,  'Fifth stay',   'A regular now.'),
  (10, 'Tenth stay',   'Ten visits.')
on conflict (stays) do nothing;


-- ─────────────────────────────────────────────────────────────────────────────
-- What Kaye did about it. One row per guest per threshold, so a flag that has
-- been handled stops asking — and so there is a record of who was given what,
-- which is the part a dismissed notification loses.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists loyalty_acknowledgements (
  guest_id     uuid not null references guests(id) on delete cascade,
  stays        integer not null references loyalty_milestones(stays) on delete cascade,
  -- 'gift' records that something was actually given; 'seen' is just dismissal.
  outcome      text not null default 'seen' check (outcome in ('seen', 'gift')),
  note         text,
  acknowledged_by uuid,
  acknowledged_at timestamptz not null default now(),
  primary key (guest_id, stays)
);

comment on table loyalty_acknowledgements is
  'A handled milestone. outcome=gift means something was given and what; seen means noticed and passed over. Either way it stops nagging.';

create index if not exists idx_loyalty_ack_guest on loyalty_acknowledgements (guest_id);

notify pgrst, 'reload schema';
