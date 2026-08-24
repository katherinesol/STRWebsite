-- Merging two guest records into one.
--
-- ATOMIC OR NEITHER. A merge writes to four tables: the audit row, bookings,
-- calendar_blocks, conversations, and then deletes the absorbed guest. PostgREST
-- runs one statement per request, so doing this from the app means five requests
-- and five chances to stop half way — the worst outcome being the guest deleted
-- with no audit row, which is a merge that cannot be undone. A function runs the
-- lot in one transaction: it all lands or none of it does.
--
-- THE AUDIT ROW IS WRITTEN FIRST and holds the entire absorbed record as jsonb,
-- so reconstructing it is a matter of reading the row back, not remembering what
-- was there.
--
-- BACKFILL NEVER OVERWRITES. If the survivor is missing an email and the
-- absorbed record has one, it is filled in. If both have one, the survivor keeps
-- its own — same rule as resolveGuest, for the same reason: a value someone
-- typed beats one an import invented.

-- THE PARAMETER NAMES ARE PART OF THE CONTRACT. PostgREST resolves an RPC by
-- the exact set of argument names in the request body, and Postgres refuses to
-- rename a parameter on create or replace (42P13) — so these three names cannot
-- be changed without dropping the function first. They are aliased to p_* on the
-- first three lines of the body so the statements below can use the prefixed
-- form without colliding with the identically-named columns of guest_merges,
-- which is what the prefix was for in the first place.
create or replace function merge_guests(
  survivor_id uuid,
  absorbed_id uuid,
  merged_by uuid default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  p_survivor  uuid := survivor_id;
  p_absorbed  uuid := absorbed_id;
  p_merged_by uuid := merged_by;
  v_absorbed  guests%rowtype;
  v_survivor  guests%rowtype;
  v_bookings  int;
  v_blocks    int;
  v_convs     int;
  v_access    int := 0;
  v_promote   jsonb;
begin
  if p_survivor = p_absorbed then
    raise exception 'A record cannot absorb itself';
  end if;

  select * into v_survivor from guests where id = p_survivor;
  if not found then raise exception 'Survivor % not found', p_survivor; end if;

  select * into v_absorbed from guests where id = p_absorbed;
  if not found then raise exception 'Absorbed record % not found', p_absorbed; end if;

  -- the whole record, before anything moves
  insert into guest_merges (survivor_id, absorbed_id, absorbed, merged_by)
  values (p_survivor, p_absorbed, to_jsonb(v_absorbed), p_merged_by);

  update bookings        set guest_id = p_survivor where guest_id = p_absorbed;
  get diagnostics v_bookings = row_count;
  update calendar_blocks set guest_id = p_survivor where guest_id = p_absorbed;
  get diagnostics v_blocks = row_count;
  update conversations   set guest_id = p_survivor where guest_id = p_absorbed;
  get diagnostics v_convs = row_count;

  -- fill the survivor's gaps, never its answers. A fabricated @platform.noemail
  -- address counts as a gap, not an answer.
  update guests set
    name  = coalesce(nullif(trim(v_survivor.name), ''),  v_absorbed.name),
    email = coalesce(
              nullif(case when v_survivor.email ilike '%@platform.noemail'
                       or v_survivor.email ilike '%@imported.noemail' then '' else v_survivor.email end, ''),
              nullif(case when v_absorbed.email ilike '%@platform.noemail'
                       or v_absorbed.email ilike '%@imported.noemail' then '' else v_absorbed.email end, '')),
    phone = coalesce(nullif(trim(v_survivor.phone), ''), v_absorbed.phone),
    notes = case
              when coalesce(trim(v_survivor.notes), '') = '' then v_absorbed.notes
              when coalesce(trim(v_absorbed.notes), '') = '' then v_survivor.notes
              else v_survivor.notes || E'\n' || v_absorbed.notes
            end,
    id_verified = v_survivor.id_verified or v_absorbed.id_verified
  where id = p_survivor;

  -- ───────── access rows ─────────
  -- booking_guests cascades on guest delete, so without this the absorbed
  -- guest's access simply vanishes on a merge. Repointing alone is not enough
  -- either: where both records sit on the same booking, moving the row collides
  -- with unique (booking_id, booking_kind, guest_id).
  --
  -- ORDER MATTERS, and the obvious order is wrong. Promoting the survivor to
  -- lead while the absorbed lead row still exists puts two leads on one booking,
  -- and booking_guests_one_lead is a plain unique index — checked per statement,
  -- not deferred to commit — so it raises there and then. The bookings needing a
  -- promotion are therefore recorded first, the collisions cleared, and the
  -- promotion applied only once the old lead row is gone.

  -- 1. remember where the absorbed record led and the survivor is also present
  select coalesce(jsonb_agg(jsonb_build_object('b', a.booking_id, 'k', a.booking_kind)), '[]'::jsonb)
    into v_promote
    from booking_guests a
    join booking_guests s
      on s.booking_id = a.booking_id
     and s.booking_kind = a.booking_kind
     and s.guest_id = p_survivor
   where a.guest_id = p_absorbed
     and a.role = 'lead';

  -- 2. both on the same booking: the survivor's row already covers it
  delete from booking_guests a
   where a.guest_id = p_absorbed
     and exists (select 1 from booking_guests s
                  where s.guest_id = p_survivor
                    and s.booking_id = a.booking_id
                    and s.booking_kind = a.booking_kind);

  -- 3. the booking has no lead now — give it the survivor's row
  update booking_guests s set role = 'lead'
   where s.guest_id = p_survivor
     and s.role <> 'lead'
     and exists (select 1 from jsonb_array_elements(v_promote) e
                  where (e->>'b')::uuid = s.booking_id
                    and  e->>'k'        = s.booking_kind);

  -- 4. everything left belongs to bookings the survivor was not on
  update booking_guests set guest_id = p_survivor where guest_id = p_absorbed;
  get diagnostics v_access = row_count;

  delete from guests where id = p_absorbed;

  return jsonb_build_object(
    'ok', true,
    'survivor_id', p_survivor,
    'absorbed_id', p_absorbed,
    'bookings_moved', v_bookings,
    'blocks_moved', v_blocks,
    'conversations_moved', v_convs,
    'access_moved', v_access
  );
end;
$$;

-- Lock it to the server. The revoke alone is not enough: PostgREST builds its
-- schema cache per role, so a function the service role cannot execute is a
-- function it reports as not existing (PGRST202) rather than as forbidden. The
-- grant has to follow the revoke or nothing can call this at all.
revoke all on function merge_guests(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function merge_guests(uuid, uuid, uuid) to service_role;
