-- ═════════════════════════════════════════════════════════════════════════════
-- The pricing write path: what Katherine KEEPS, and what each platform charges
-- to get her there.
--
-- Nothing here stores a guest price. The calculator works the list price back
-- from a target net through lib/gross-up.ts, and it does that on READ, every
-- time. A stored price is a price that drifts the day a commission changes and
-- nobody remembers which rows to recompute — the same failure that left three
-- tables disagreeing about min_stay and cleaning. So the TARGET is the stored
-- fact, the rate is the stored fact, and the price is always derived.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- platform_rates — what each platform takes, and since when.
--
-- EFFECTIVE_FROM IS MATCHED AGAINST THE DATE THE BOOKING WAS MADE, NEVER THE
-- DATE OF THE STAY. This is not a preference, it is what the ledger says.
-- Airbnb moved these listings from the split-fee model (3% host) to host-only
-- (15.5%) between 7 and 11 August 2026, and the two rates INTERLEAVE by stay
-- date across that boundary: the stay on 17 Aug paid 15.5%, the stay on 19 Aug
-- paid 3%, the stay on 22 Aug paid 3%, the stay on 29 Aug paid 15.5%. Sorted by
-- when the reservation was MADE, the same rows separate cleanly with no
-- overlap at all. A lookup keyed on the stay date would misprice at least six
-- recorded bookings and quietly corrupt the payout reconciliation this session
-- spent days closing.
--
-- Verified against 32 Airbnb bookings: every reservation made on or before
-- 7 Aug 2026 was charged 3.00%, every one made on or after 11 Aug was charged
-- 15.50%. Two January and May stays entered retroactively in late August still
-- carry 3%, which is the tell — they are old bookings backfilled, and their
-- rate follows the booking, not the keystroke.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists platform_rates (
  platform        text not null check (platform in ('airbnb', 'vrbo', 'houfy')),

  -- stored as fractions (0.155), never percentages (15.5). The gross-up divisor
  -- in lib/gross-up.ts consumes fractions, and a column that sometimes holds one
  -- and sometimes the other is a 100x error waiting for a quiet afternoon.
  commission_pct  numeric(6,5) not null check (commission_pct >= 0 and commission_pct < 1),
  processing_pct  numeric(6,5) not null default 0 check (processing_pct >= 0 and processing_pct < 1),

  -- VRBO charges its 3% on the TAX-INCLUSIVE total the guest pays, so the tax
  -- rate enters its divisor and a Toronto night grosses up differently from a
  -- Port Colborne one. Airbnb and Houfy do not, and the flag says which.
  processing_on_tax_inclusive boolean not null default false,

  effective_from  date not null,
  note            text,
  created_at      timestamptz not null default now(),

  primary key (platform, effective_from)
);

comment on table platform_rates is
  'What each platform takes. effective_from is matched against the BOOKING date, never the stay date — Airbnb''s 3%/15.5% rows interleave by stay and separate cleanly by booking.';
comment on column platform_rates.commission_pct is
  'A fraction, not a percentage. 0.155 means 15.5%.';


-- The history, so a 2026 payout still reconciles at the rate it was actually
-- charged. 2020-01-01 is a floor, not a claim about when the rate began.
insert into platform_rates (platform, commission_pct, processing_pct, processing_on_tax_inclusive, effective_from, note) values
  ('airbnb', 0.03000, 0, false, '2020-01-01',
   'Split-fee model: 3% host commission, the guest paying a service fee on top. Every Airbnb reservation made on or before 2026-08-07 was charged exactly this.'),
  ('airbnb', 0.15500, 0, false, '2026-08-08',
   'Host-only model: 15.5% on accommodation, no guest service fee. First seen on reservations made 2026-08-11; the changeover sits between 08-07 and 08-11, so the boundary is placed at the first day not contradicted by a recorded booking.'),
  ('vrbo',   0.05000, 0.03000, true, '2020-01-01',
   '5% commission plus 3% payment processing. The processing is charged on the tax-inclusive total, so it works out near 3.56% of the pre-tax base — which is what the recorded VRBO bookings show.'),
  ('houfy',  0.00000, 0, false, '2020-01-01',
   'No host commission and no processing fee. The 17% a guest sees on Houfy is tax, not a platform cut.')
on conflict (platform, effective_from) do nothing;


-- ─────────────────────────────────────────────────────────────────────────────
-- property_pricing — the four targets.
--
-- These are what Katherine KEEPS after the platform takes its cut, not what a
-- guest is shown. Every one is nullable and starts null: an unset target means
-- "not decided yet", which is the truth today, and is different from a target
-- of zero. Nothing computes a price from a null.
-- ─────────────────────────────────────────────────────────────────────────────
alter table property_pricing
  add column if not exists target_net_nightly          numeric(10,2) check (target_net_nightly          is null or target_net_nightly          >= 0),
  add column if not exists target_net_cleaning         numeric(10,2) check (target_net_cleaning         is null or target_net_cleaning         >= 0),
  add column if not exists target_net_pet              numeric(10,2) check (target_net_pet              is null or target_net_pet              >= 0),
  -- a RATE, not a total: $75 per guest per night above the property's maximum.
  -- The charge itself is computed per booking and cannot sit in a column.
  add column if not exists target_net_extra_guest_rate numeric(10,2) check (target_net_extra_guest_rate is null or target_net_extra_guest_rate >= 0);

comment on column property_pricing.target_net_nightly is
  'What Katherine keeps per night, before the platform''s cut is grossed up. The guest price is computed from this, never stored.';
comment on column property_pricing.target_net_extra_guest_rate is
  'Per guest per night above max_guests. A rate, not a total — the charge depends on the booking.';


-- ─────────────────────────────────────────────────────────────────────────────
-- pricing_overrides — the seasonal and event bands, reused rather than rebuilt.
--
-- It already carries a date range and a `rate`. That `rate` is a LIST PRICE and
-- stays exactly what it is; overwriting its meaning in place would silently
-- reinterpret four existing rows. The target net gets its own column beside it,
-- so a band can be stated either way and it is never ambiguous which was meant.
-- ─────────────────────────────────────────────────────────────────────────────
alter table pricing_overrides
  add column if not exists target_net numeric(10,2) check (target_net is null or target_net >= 0);

comment on column pricing_overrides.target_net is
  'Per-date target net nightly. Beside `rate`, which remains a list price — a band states one or the other, never both meanings of one column.';

notify pgrst, 'reload schema';
