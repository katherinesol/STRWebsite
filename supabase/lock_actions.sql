-- ═════════════════════════════════════════════════════════════════════════════
-- lock_actions — the WRITE queue that replaces Seam.
--
-- The server cannot program a lock. The Schlage password lives in the owner's
-- Keychain and never reaches Vercel, so every write path here records an
-- INTENT and a local worker makes it happen. That constraint is the design,
-- not a limitation of it: an intent that is written down survives a failure,
-- and the eight Seam write-calls it replaces did not.
--
-- KEYED ON schlage_device_id, NEVER ON lock_name. Schlage's name for a lock is
-- not ours — "Apt 2 Emergency Exit" here is "Royal York Apt 2 Emergency Exit"
-- there — and that pair has already fuzzy-matched wrong once. lock_id carries
-- the relationship; schlage_device_id is denormalised alongside it so the
-- worker can serialise on the physical device without a join, which matters
-- because ROYAL SIDE HAS TWO lock_id ROWS AND ONE DEVICE. East and West share
-- that side door. Serialising on lock_id would let two property rows write to
-- one lock simultaneously, which is the likeliest explanation for its
-- reputation for rejecting rapid writes.
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists lock_actions (
  id            uuid primary key default gen_random_uuid(),

  booking_id    uuid not null,
  -- which table booking_id points at. Same vocabulary as booking_guests.
  booking_kind  text not null check (booking_kind in ('platform', 'direct')),

  property_id   text not null,
  lock_id       uuid not null references property_locks(id) on delete cascade,
  -- denormalised on purpose: the worker's serialisation key, and it must remain
  -- the value that was true when the intent was recorded.
  schlage_device_id text not null,

  -- NOT NULL is load-bearing, not decoration. A CHECK using IN/= ANY passes a
  -- NULL by three-valued logic, so `action text check (action in (...))` would
  -- happily accept a row with no action at all — a queue entry the worker cannot
  -- classify and will either skip forever or crash on.
  action        text not null check (action in ('program', 'revoke', 'reschedule')),
  status        text not null default 'pending'
                check (status in ('pending', 'claimed', 'done', 'failed')),

  -- The code REQUESTED. For Airbnb stays this is Airbnb's own code; for direct
  -- bookings it is a preference, because only the worker can see what is already
  -- on the lock. If the worker has to resolve a collision it records what it
  -- actually programmed in code_final and corrects the booking's door_code.
  code          text,
  code_final    text,
  starts_at     timestamptz,
  ends_at       timestamptz,

  attempts      int not null default 0,
  last_error    text,
  -- Backoff. The worker ignores rows until not_before, so Royal Side's need for
  -- patience becomes a property of the queue instead of a habit of whoever is
  -- running it. attempts + not_before IS the retry queue.
  not_before    timestamptz not null default now(),

  requested_by  uuid,
  created_at    timestamptz not null default now(),
  claimed_at    timestamptz,
  done_at       timestamptz
);

-- SUPERSEDE, DO NOT STACK. Editing a booking's dates twice before the worker
-- runs must leave one intent, not two. Partial so that done/failed history
-- accumulates freely — only the live intent is constrained.
create unique index if not exists lock_actions_one_pending
  on lock_actions (booking_id, booking_kind, lock_id, action)
  where status = 'pending';

-- the worker's claim query
create index if not exists lock_actions_drain
  on lock_actions (status, not_before, created_at)
  where status in ('pending', 'claimed');

create index if not exists lock_actions_booking
  on lock_actions (booking_id, booking_kind);

comment on table lock_actions is
  'WRITE queue for door codes. The server records intent; a local pyschlage worker executes. Serialise on schlage_device_id, never lock_id: Royal Side is one physical lock with two property rows.';


-- ═════════════════════════════════════════════════════════════════════════════
-- queue_lock_action — the only supported way to add an intent.
--
-- ATOMIC BECAUSE THE SUPERSEDE IS TWO STATEMENTS. PostgREST runs one statement
-- per request, so doing this from the app means an upsert and a cancel with a
-- gap between them, and the gap is exactly where a double-program lives.
--
-- A REVOKE CANCELS PENDING WORK FOR THAT DOOR. Cancelling a booking whose
-- program has not drained yet must not program the code and then remove it —
-- the guest would briefly have working access to a stay they no longer hold,
-- and the log would show both as successes.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function queue_lock_action(
  p_booking_id   uuid,
  p_booking_kind text,
  p_lock_id      uuid,
  p_action       text,
  p_code         text default null,
  p_starts_at    timestamptz default null,
  p_ends_at      timestamptz default null,
  p_requested_by uuid default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_lock   property_locks%rowtype;
  v_id     uuid;
  v_cancel int := 0;
begin
  select * into v_lock from property_locks where id = p_lock_id;
  if not found then
    raise exception 'No such lock %', p_lock_id;
  end if;
  if v_lock.schlage_device_id is null then
    raise exception 'Lock % (%) has no schlage_device_id — the worker could not act on this',
      v_lock.lock_name, p_lock_id;
  end if;

  -- a revoke supersedes any pending work on this door for this booking
  if p_action = 'revoke' then
    update lock_actions
       set status = 'failed',
           last_error = 'superseded by a revoke — the booking was cancelled before this ran',
           done_at = now()
     where booking_id = p_booking_id
       and booking_kind = p_booking_kind
       and lock_id = p_lock_id
       and status = 'pending'
       and action in ('program', 'reschedule');
    get diagnostics v_cancel = row_count;
  end if;

  insert into lock_actions (
    booking_id, booking_kind, property_id, lock_id, schlage_device_id,
    action, code, starts_at, ends_at, requested_by
  ) values (
    p_booking_id, p_booking_kind, v_lock.property_id, p_lock_id, v_lock.schlage_device_id,
    p_action, p_code, p_starts_at, p_ends_at, p_requested_by
  )
  on conflict (booking_id, booking_kind, lock_id, action) where status = 'pending'
  do update set
    code       = excluded.code,
    starts_at  = excluded.starts_at,
    ends_at    = excluded.ends_at,
    -- a re-request is a fresh chance, not a continuation of a failing one
    attempts   = 0,
    last_error = null,
    not_before = now(),
    created_at = now()
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'action', p_action,
    'lock', v_lock.lock_name,
    'schlage_device_id', v_lock.schlage_device_id,
    'cancelled_pending', v_cancel
  );
end;
$$;

-- The revoke strips service_role too, because its access came through PUBLIC,
-- and PostgREST builds its schema cache per role — so a function service_role
-- cannot execute is reported as NOT EXISTING (PGRST202) rather than forbidden.
revoke all on function queue_lock_action(uuid, text, uuid, text, text, timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function queue_lock_action(uuid, text, uuid, text, text, timestamptz, timestamptz, uuid) to service_role;

notify pgrst, 'reload schema';
