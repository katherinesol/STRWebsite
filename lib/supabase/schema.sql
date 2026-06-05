create table guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  phone text,
  id_verified boolean default false,
  returning_guest boolean default false,
  referral_code text unique default substring(md5(random()::text), 1, 8),
  locked_rate_enabled boolean default false,
  locked_rate_royal_york numeric(10,2),
  locked_rate_nickel_beach numeric(10,2),
  notes text,
  created_at timestamptz default now()
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  property_id text not null,
  guest_id uuid references guests(id),
  check_in date not null,
  check_out date not null,
  nights integer not null,
  guests integer not null,
  status text default 'pending_payment' check (status in ('pending_payment','confirmed','active','completed','cancelled')),
  payment_method text check (payment_method in ('card','etransfer')),
  accommodation numeric(10,2),
  cleaning_fee numeric(10,2),
  hst numeric(10,2),
  mat numeric(10,2),
  addon_fee numeric(10,2) default 0,
  total numeric(10,2),
  deposit_amount numeric(10,2),
  deposit_paid_at timestamptz,
  second_payment_amount numeric(10,2),
  second_due_date date,
  second_paid_at timestamptz,
  final_payment_amount numeric(10,2),
  final_due_date date,
  final_paid_at timestamptz,
  early_checkin boolean default false,
  early_checkin_time text,
  late_checkout boolean default false,
  late_checkout_time text,
  bag_drop text default 'none',
  instacart_requested boolean default false,
  vehicle_count integer default 0,
  plate_numbers jsonb default '[]',
  plates_pending boolean default false,
  stripe_payment_intent_id text,
  stripe_deposit_id text,
  security_deposit_status text default 'none' check (security_deposit_status in ('none','held','released','claimed')),
  cancellation_reason text,
  cancelled_at timestamptz,
  created_at timestamptz default now()
);

create table calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  property_id text not null,
  start_date date not null,
  end_date date not null,
  reason text default 'manual' check (reason in ('manual','cleaning','maintenance','owner')),
  notes text,
  created_at timestamptz default now()
);

create table newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  subscribed_at timestamptz default now(),
  unsubscribed_at timestamptz
);

create table damage_reports (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id),
  property_id text not null,
  item text not null,
  location text,
  description text,
  photo_urls jsonb default '[]',
  amount_claimed numeric(10,2),
  linked_to_deposit boolean default false,
  created_at timestamptz default now()
);

create table property_settings (
  id uuid primary key default gen_random_uuid(),
  property_id text unique not null,
  nightly_rate numeric(10,2),
  cleaning_fee numeric(10,2),
  earliest_checkin text default '16:00',
  latest_checkout text default '11:00',
  min_stay integer default 2,
  max_advance_days integer default 365,
  early_checkin_fee_per_hour numeric(10,2) default 10,
  late_checkout_fee_per_hour numeric(10,2) default 10,
  parking_spots integer default 1,
  bag_drop_available boolean default false,
  instacart_available boolean default true,
  security_deposit_amount numeric(10,2),
  updated_at timestamptz default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id),
  property_id text not null,
  guest_name text,
  platform text default 'direct' check (platform in ('direct','airbnb','vrbo','houfy')),
  rating integer check (rating between 1 and 5),
  body text,
  published boolean default false,
  host_reply text,
  created_at timestamptz default now()
);

create table access_codes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id),
  property_id text not null,
  code text not null,
  generated_at timestamptz default now(),
  revoked_at timestamptz,
  notes text
);

create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_guest_id uuid references guests(id),
  referred_guest_id uuid references guests(id),
  referred_booking_id uuid references bookings(id),
  referrer_reward_amount numeric(10,2),
  referred_reward_amount numeric(10,2),
  referrer_reward_status text default 'pending' check (referrer_reward_status in ('pending','applied','expired')),
  referred_reward_status text default 'pending' check (referred_reward_status in ('pending','applied','expired')),
  created_at timestamptz default now()
);

create table admin_settings (
  id integer primary key default 1 check (id = 1),
  referral_reward_amount numeric(10,2) default 50,
  updated_at timestamptz default now()
);

insert into admin_settings (id) values (1) on conflict do nothing;

insert into property_settings (property_id, nightly_rate, cleaning_fee, earliest_checkin, latest_checkout, min_stay, parking_spots, bag_drop_available, instacart_available, security_deposit_amount)
values
  ('royal-york-east', 180, 120, '10:00', '14:00', 2, 1, true, true, 500),
  ('royal-york-west', 180, 120, '10:00', '14:00', 2, 1, true, true, 500),
  ('nickel-beach', 320, 250, '11:00', '14:00', 3, 4, false, true, 1000)
on conflict (property_id) do nothing;

alter table guests enable row level security;
alter table bookings enable row level security;
alter table calendar_blocks enable row level security;
alter table newsletter_subscribers enable row level security;
alter table damage_reports enable row level security;
alter table property_settings enable row level security;
alter table reviews enable row level security;
alter table access_codes enable row level security;
alter table referrals enable row level security;
alter table admin_settings enable row level security;
