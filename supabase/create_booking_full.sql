-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ TWO FIXES OWED, TO GO IN TOGETHER ON THE NEXT PASS AT THIS FUNCTION      │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Both are in the guest/booking insert below, so fix them in one round trip
-- rather than two trips to the SQL editor.
--
-- 1. IT DOES NOT GENERATE confirmation_code.
--    The guest gate (app/api/guest-support/verify) matches on that column, so a
--    direct booking created through this function has NO guest access at all —
--    the guest cannot reach the door code, the house guide or the concierge.
--    RS-1005 and RS-1006 (Alain Roy) both have a null code for this reason.
--    Neither stay is current so nothing is broken today; the next one would be.
--    The TypeScript paths build it as 'HAUS-' || 8 random chars — see
--    app/api/bookings/route.ts. Match that.
--
-- 2. IT DOES NOT POPULATE first_name / last_name.
--    Added and backfilled 2026-08-24; verification compares the surname. The
--    insert at `insert into guests (id, name, email, phone)` leaves both null,
--    so guests created here fall through to surnameOf()'s last-token fallback
--    in lib/keyholder/guest-match.ts. That fallback works, which is why this is
--    not urgent — but it exists to cover exactly this gap, and the gap should
--    close. Split on the last whitespace: everything before is first_name,
--    the final token is last_name, and a single-word name gets a null surname.
--
-- All four TypeScript guest-creation paths already do both correctly
-- (guest-resolve, the guests POST, and the two calendar-block routes). This
-- function is the last one that does not.
--
-- Before re-running: the installed signature was checked on 2026-08-24 and
-- matches this file (one `payload` argument). merge_guests had drifted from its
-- committed .sql and could not be re-run without erroring, so check again — the
-- repository is not evidence of what is installed. See DEPLOY.md.

-- True all-or-nothing booking creation from Haussy.
--
-- A booking is three tables: the booking row (bookings for direct,
-- calendar_blocks for platform), a guest row, and any platform-fee expenses.
-- PostgREST issues one statement per request, so from the API this is three
-- independent writes: a failure after the first leaves a booking with no guest,
-- or a guest with no booking. This runs in a single transaction.
--
-- IDEMPOTENT: the caller supplies every id. A repeat submit — double-click, a
-- retried request — collides on the primary key and returns already=true rather
-- than creating a second booking for the same stay.
--
-- TAX: hst, mat, apply_tax and taxes_you_remit are passed in already computed by
-- lib/tax-rates.ts. This function stores what it is given and never derives tax
-- itself; there must be exactly one implementation of the rules, and it is the
-- TypeScript one the confirm card showed the owner.

create or replace function create_booking_full(payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  bk_id    uuid := (payload->>'booking_id')::uuid;
  kind     text := coalesce(payload->>'kind', 'platform');
  g        jsonb := payload->'guest';
  b        jsonb := payload->'booking';
  item     jsonb;
  gid      uuid;
  n_exp    int := 0;
begin
  if kind not in ('direct', 'platform') then
    return jsonb_build_object('ok', false, 'error', 'kind must be direct or platform');
  end if;

  -- ---- guest: link an existing one, or create the proposed one ----
  gid := nullif(payload->>'guest_id', '')::uuid;

  if gid is null and g is not null and g <> 'null'::jsonb and coalesce(g->>'name','') <> '' then
    gid := (g->>'id')::uuid;
    insert into guests (id, name, email, phone)
    values (gid, g->>'name', nullif(g->>'email',''), nullif(g->>'phone',''))
    on conflict (id) do nothing;
  elsif gid is not null then
    -- a returning guest: mark them so, exactly as the legacy path did
    update guests set returning_guest = true where id = gid;
  end if;

  -- ---- the booking row ----
  if kind = 'platform' then
    insert into calendar_blocks (
      id, property_id, start_date, end_date, reason, platform, is_booking,
      guest_id, guest_name, guest_email, guest_phone, guests,
      nightly_rate, accommodation, cleaning_fee, extras, discount,
      taxes_collected, taxes_you_remit, taxes_platform_remits, hst, mat, apply_tax, tax_note,
      guest_total, payout_amount, commission, payment_processing_fee,
      confirmation_code, early_checkin_time, late_checkout_time, door_code,
      trip_purpose, trip_purpose_note, notes
    ) values (
      bk_id,
      b->>'property_id', (b->>'start_date')::date, (b->>'end_date')::date,
      coalesce(b->>'reason','manual'), nullif(b->>'platform',''), true,
      gid, nullif(b->>'guest_name',''), nullif(b->>'guest_email',''), nullif(b->>'guest_phone',''),
      (b->>'guests')::int,
      (b->>'nightly_rate')::numeric, (b->>'accommodation')::numeric, (b->>'cleaning_fee')::numeric,
      (b->>'extras')::numeric, (b->>'discount')::numeric,
      (b->>'taxes_collected')::numeric, (b->>'taxes_you_remit')::numeric,
      (b->>'taxes_platform_remits')::numeric, (b->>'hst')::numeric, (b->>'mat')::numeric,
      (b->>'apply_tax')::boolean, nullif(b->>'tax_note',''),
      (b->>'guest_total')::numeric, (b->>'payout_amount')::numeric,
      (b->>'commission')::numeric, (b->>'payment_processing_fee')::numeric,
      nullif(b->>'confirmation_code',''), nullif(b->>'early_checkin_time',''),
      nullif(b->>'late_checkout_time',''), nullif(b->>'door_code',''),
      nullif(b->>'trip_purpose',''), nullif(b->>'trip_purpose_note',''),
      nullif(b->>'notes','')
    );
  else
    insert into bookings (
      id, property_id, guest_id, check_in, check_out, nights, guests,
      guests_adults, guests_children, status, payment_method,
      accommodation, cleaning_fee, addon_fee, hst, mat, apply_tax, tax_note, total,
      confirmation_code, booking_reference,
      early_checkin_time, late_checkout_time, trip_purpose, trip_purpose_note
    ) values (
      bk_id,
      b->>'property_id', gid, (b->>'check_in')::date, (b->>'check_out')::date,
      (b->>'nights')::int, (b->>'guests')::int,
      (b->>'guests_adults')::int, (b->>'guests_children')::int,
      coalesce(b->>'status','confirmed'), nullif(b->>'payment_method',''),
      (b->>'accommodation')::numeric, (b->>'cleaning_fee')::numeric, (b->>'addon_fee')::numeric,
      (b->>'hst')::numeric, (b->>'mat')::numeric,
      (b->>'apply_tax')::boolean, nullif(b->>'tax_note',''), (b->>'total')::numeric,
      nullif(b->>'confirmation_code',''), nullif(b->>'booking_reference',''),
      nullif(b->>'early_checkin_time',''), nullif(b->>'late_checkout_time',''),
      nullif(b->>'trip_purpose',''), nullif(b->>'trip_purpose_note','')
    );
  end if;

  -- ---- platform fee expenses, only the ones the owner ticked ----
  for item in select * from jsonb_array_elements(coalesce(payload->'expenses','[]'::jsonb)) loop
    insert into expenses (id, property_id, date, vendor, description, amount, category, notes, ai_extracted, confirmed)
    values (
      (item->>'id')::uuid, item->>'property_id', (item->>'date')::date,
      item->>'vendor', item->>'description', (item->>'amount')::numeric,
      item->>'category', nullif(item->>'notes',''),
      coalesce((item->>'ai_extracted')::boolean, true),
      coalesce((item->>'confirmed')::boolean, false)
    );
    n_exp := n_exp + 1;
  end loop;

  return jsonb_build_object('ok', true, 'booking_id', bk_id, 'kind', kind,
                            'guest_id', gid, 'expenses', n_exp);
exception
  when unique_violation then
    -- the same client-generated id already landed: a repeat submit
    return jsonb_build_object('ok', true, 'already', true, 'booking_id', bk_id);
end;
$$;

grant execute on function create_booking_full(jsonb) to service_role;
