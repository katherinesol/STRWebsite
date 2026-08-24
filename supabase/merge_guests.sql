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

create or replace function merge_guests(
  p_survivor uuid,
  p_absorbed uuid,
  p_merged_by uuid default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_absorbed  guests%rowtype;
  v_survivor  guests%rowtype;
  v_bookings  int;
  v_blocks    int;
  v_convs     int;
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

  delete from guests where id = p_absorbed;

  return jsonb_build_object(
    'ok', true,
    'survivor_id', p_survivor,
    'absorbed_id', p_absorbed,
    'moved', jsonb_build_object('bookings', v_bookings, 'blocks', v_blocks, 'conversations', v_convs)
  );
end;
$$;

revoke all on function merge_guests(uuid, uuid, uuid) from public, anon, authenticated;
