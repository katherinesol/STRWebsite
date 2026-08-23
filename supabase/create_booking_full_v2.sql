-- create_booking_full, gaining merge and block modes.
--
-- Replaces the create-only version. Three modes, one transaction primitive, one
-- idempotency story:
--
--   create  insert a new booking (unchanged behaviour)
--   merge   fill in a booking that already exists — the row the iCal feed made
--           with only dates on it, which is how most bookings arrive
--   block   owner/cleaning/maintenance dates, is_booking = false, no money
--
-- MERGE NEVER BLANKS. A column is written only when its key is PRESENT in the
-- payload, tested with `?`. A field the screenshot did not mention keeps whatever
-- is already there, so enriching can never erase something typed by hand. This is
-- why the update is written out key by key instead of a bulk jsonb merge.
--
-- TAX ON MERGE. The legacy enrich route wrote taxes_collected and nothing else,
-- which is where 19 of 28 platform bookings got their null hst / mat / apply_tax.
-- Merge takes the same computed tax columns as create.

create or replace function create_booking_full(payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  mode     text := coalesce(payload->>'mode', 'create');
  bk_id    uuid := nullif(payload->>'booking_id','')::uuid;
  target   uuid := nullif(payload->>'target_id','')::uuid;
  kind     text := coalesce(payload->>'kind', 'platform');
  g        jsonb := payload->'guest';
  b        jsonb := payload->'booking';
  item     jsonb;
  gid      uuid;
  n_exp    int := 0;
  touched  int := 0;
begin
  if mode not in ('create','merge','block') then
    return jsonb_build_object('ok', false, 'error', 'mode must be create, merge or block');
  end if;
  if kind not in ('direct','platform') then
    return jsonb_build_object('ok', false, 'error', 'kind must be direct or platform');
  end if;

  -- ───────── guest: link an existing one, or create the proposed one ─────────
  gid := nullif(payload->>'guest_id','')::uuid;
  if gid is null and g is not null and g <> 'null'::jsonb and coalesce(g->>'name','') <> '' then
    gid := (g->>'id')::uuid;
    insert into guests (id, name, email, phone)
    values (gid, g->>'name', nullif(g->>'email',''), nullif(g->>'phone',''))
    on conflict (id) do nothing;
  elsif gid is not null then
    update guests set returning_guest = true where id = gid;
  end if;

  -- ───────── BLOCK ─────────
  if mode = 'block' then
    insert into calendar_blocks (
      id, property_id, start_date, end_date, reason, is_booking,
      block_for, block_for_name, notes
    ) values (
      bk_id, b->>'property_id', (b->>'start_date')::date, (b->>'end_date')::date,
      coalesce(b->>'reason','manual'), false,
      nullif(b->>'block_for',''), nullif(b->>'block_for_name',''), nullif(b->>'notes','')
    );
    return jsonb_build_object('ok', true, 'mode', 'block', 'booking_id', bk_id);
  end if;

  -- ───────── MERGE ─────────
  if mode = 'merge' then
    if target is null then
      return jsonb_build_object('ok', false, 'error', 'target_id required for merge');
    end if;

    if kind = 'platform' then
      update calendar_blocks set
        is_booking            = true,
        guest_id              = coalesce(gid, guest_id),
        guest_name            = case when b ? 'guest_name'            then nullif(b->>'guest_name','')            else guest_name end,
        guest_email           = case when b ? 'guest_email'           then nullif(b->>'guest_email','')           else guest_email end,
        guest_phone           = case when b ? 'guest_phone'           then nullif(b->>'guest_phone','')           else guest_phone end,
        guests                = case when b ? 'guests'                then (b->>'guests')::int                    else guests end,
        platform              = case when b ? 'platform'              then nullif(b->>'platform','')              else platform end,
        start_date            = case when b ? 'start_date'            then (b->>'start_date')::date               else start_date end,
        end_date              = case when b ? 'end_date'              then (b->>'end_date')::date                 else end_date end,
        nightly_rate          = case when b ? 'nightly_rate'          then (b->>'nightly_rate')::numeric          else nightly_rate end,
        accommodation         = case when b ? 'accommodation'         then (b->>'accommodation')::numeric         else accommodation end,
        cleaning_fee          = case when b ? 'cleaning_fee'          then (b->>'cleaning_fee')::numeric          else cleaning_fee end,
        extras                = case when b ? 'extras'                then (b->>'extras')::numeric                else extras end,
        discount              = case when b ? 'discount'              then (b->>'discount')::numeric              else discount end,
        taxes_collected       = case when b ? 'taxes_collected'       then (b->>'taxes_collected')::numeric       else taxes_collected end,
        taxes_you_remit       = case when b ? 'taxes_you_remit'       then (b->>'taxes_you_remit')::numeric       else taxes_you_remit end,
        taxes_platform_remits = case when b ? 'taxes_platform_remits' then (b->>'taxes_platform_remits')::numeric else taxes_platform_remits end,
        hst                   = case when b ? 'hst'                   then (b->>'hst')::numeric                   else hst end,
        mat                   = case when b ? 'mat'                   then (b->>'mat')::numeric                   else mat end,
        apply_tax             = case when b ? 'apply_tax'             then (b->>'apply_tax')::boolean             else apply_tax end,
        tax_note              = case when b ? 'tax_note'              then nullif(b->>'tax_note','')              else tax_note end,
        guest_total           = case when b ? 'guest_total'           then (b->>'guest_total')::numeric           else guest_total end,
        payout_amount         = case when b ? 'payout_amount'         then (b->>'payout_amount')::numeric         else payout_amount end,
        commission            = case when b ? 'commission'            then (b->>'commission')::numeric            else commission end,
        payment_processing_fee= case when b ? 'payment_processing_fee' then (b->>'payment_processing_fee')::numeric else payment_processing_fee end,
        confirmation_code     = case when b ? 'confirmation_code'     then nullif(b->>'confirmation_code','')     else confirmation_code end,
        early_checkin_time    = case when b ? 'early_checkin_time'    then nullif(b->>'early_checkin_time','')    else early_checkin_time end,
        late_checkout_time    = case when b ? 'late_checkout_time'    then nullif(b->>'late_checkout_time','')    else late_checkout_time end,
        door_code             = case when b ? 'door_code'             then nullif(b->>'door_code','')             else door_code end,
        trip_purpose          = case when b ? 'trip_purpose'          then nullif(b->>'trip_purpose','')          else trip_purpose end,
        notes                 = case when b ? 'notes'                 then nullif(b->>'notes','')                 else notes end
      where id = target;
      get diagnostics touched = row_count;
    else
      update bookings set
        guest_id           = coalesce(gid, guest_id),
        guests             = case when b ? 'guests'            then (b->>'guests')::int            else guests end,
        check_in           = case when b ? 'check_in'          then (b->>'check_in')::date         else check_in end,
        check_out          = case when b ? 'check_out'         then (b->>'check_out')::date        else check_out end,
        nights             = case when b ? 'nights'            then (b->>'nights')::int            else nights end,
        accommodation      = case when b ? 'accommodation'     then (b->>'accommodation')::numeric else accommodation end,
        cleaning_fee       = case when b ? 'cleaning_fee'      then (b->>'cleaning_fee')::numeric  else cleaning_fee end,
        addon_fee          = case when b ? 'addon_fee'         then (b->>'addon_fee')::numeric     else addon_fee end,
        hst                = case when b ? 'hst'               then (b->>'hst')::numeric           else hst end,
        mat                = case when b ? 'mat'               then (b->>'mat')::numeric           else mat end,
        apply_tax          = case when b ? 'apply_tax'         then (b->>'apply_tax')::boolean     else apply_tax end,
        tax_note           = case when b ? 'tax_note'          then nullif(b->>'tax_note','')      else tax_note end,
        total              = case when b ? 'total'             then (b->>'total')::numeric         else total end,
        confirmation_code  = case when b ? 'confirmation_code' then nullif(b->>'confirmation_code','') else confirmation_code end
      where id = target;
      get diagnostics touched = row_count;
    end if;

    if touched = 0 then
      return jsonb_build_object('ok', false, 'error', 'target booking not found');
    end if;
  end if;

  -- ───────── CREATE ─────────
  if mode = 'create' then
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
        bk_id, b->>'property_id', (b->>'start_date')::date, (b->>'end_date')::date,
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
        nullif(b->>'trip_purpose',''), nullif(b->>'trip_purpose_note',''), nullif(b->>'notes','')
      );
    else
      insert into bookings (
        id, property_id, guest_id, check_in, check_out, nights, guests,
        guests_adults, guests_children, status, payment_method,
        accommodation, cleaning_fee, addon_fee, hst, mat, apply_tax, tax_note, total,
        confirmation_code, booking_reference,
        early_checkin_time, late_checkout_time, trip_purpose, trip_purpose_note
      ) values (
        bk_id, b->>'property_id', gid, (b->>'check_in')::date, (b->>'check_out')::date,
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
  end if;

  -- ───────── platform fee expenses, only the ones the owner ticked ─────────
  for item in select * from jsonb_array_elements(coalesce(payload->'expenses','[]'::jsonb)) loop
    insert into expenses (id, property_id, date, vendor, description, amount, category, notes, ai_extracted, confirmed)
    values (
      (item->>'id')::uuid, item->>'property_id', (item->>'date')::date,
      item->>'vendor', item->>'description', (item->>'amount')::numeric,
      item->>'category', nullif(item->>'notes',''),
      coalesce((item->>'ai_extracted')::boolean, true),
      coalesce((item->>'confirmed')::boolean, false)
    )
    on conflict (id) do nothing;
    n_exp := n_exp + 1;
  end loop;

  return jsonb_build_object('ok', true, 'mode', mode, 'kind', kind,
                            'booking_id', coalesce(target, bk_id),
                            'guest_id', gid, 'expenses', n_exp);
exception
  when unique_violation then
    -- the same client-generated id already landed: a repeat submit
    return jsonb_build_object('ok', true, 'already', true,
                              'booking_id', coalesce(target, bk_id));
end;
$$;

grant execute on function create_booking_full(jsonb) to service_role;
