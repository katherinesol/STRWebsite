-- ─────────────────────────────────────────────────────────────────────────────
-- The lock identity the queue keys on, and two flag corrections it exposed.
--
-- WHY NOT lock_name. Schlage's name for a lock is not ours: "Apt 2 Emergency
-- Exit" here is "Royal York Apt 2 Emergency Exit" there. That pair has already
-- fuzzy-matched wrong once, and a wrong match on a lock is a guest standing
-- outside a door. The device id is stable, opaque and cannot be near-missed.
--
-- Device ids come from the Stage A proof run, cross-checked against the map in
-- schlage-bulk.py and schlage-verify.py, which agree.
--
-- Royal Side deliberately appears twice, once per property, with ONE device id.
-- East and West share a physical side entrance, so both properties must program
-- it. That is also why it takes roughly double every other lock's write traffic,
-- which is a better explanation of its "rejects rapid writes" reputation than
-- WiFi ever was.
-- ─────────────────────────────────────────────────────────────────────────────

alter table property_locks add column if not exists schlage_device_id text;

comment on column property_locks.schlage_device_id is
  'Schlage device UUID. Authoritative key for the lock queue and the local worker. Never match a lock by lock_name: Schlage''s names differ from ours.';

update property_locks set schlage_device_id = '39e6ac4d-e25a-5e1f-bdc2-846562144370' where lock_name = 'Port Colborne';
update property_locks set schlage_device_id = '6a04a9ea-3e0c-5fb4-9b62-3e4b5638cc24' where lock_name = 'Royal Side';
update property_locks set schlage_device_id = '5e6a7526-5ac1-560a-8192-daf2231002b3' where lock_name = 'Royal York Apt 1';
update property_locks set schlage_device_id = 'f262207d-9390-5984-989e-403fd5ca9379' where lock_name = 'Apt 2';
update property_locks set schlage_device_id = 'd270af73-0d78-5ffc-8980-5177cc422968' where lock_name = 'Apt 2 Emergency Exit';

-- ── the two flag corrections, from evidence rather than from the flag ────────
--
-- airbnb_managed was typed in by hand when Seam was wired up. Nothing ever
-- checked it, and five code paths branch on it. Reading the locks settled it:
-- Airbnb's integration leaves standing "Airbnb Backup <hash>" codes and per-stay
-- "MM/DD Guest <hash>" codes, and those marks are present on exactly two doors.
--
-- PORT COLBORNE had three Airbnb Backup codes and was flagged false, so we were
-- programming a door Airbnb also programs.
--
-- ROYAL YORK APT 1 is the dangerous one. Flagged true, it is SKIPPED for Airbnb
-- bookings — but it carries no Airbnb mark of any kind, only the owner's master
-- code, and royal-york-east has never taken a booking on any platform. So the
-- first East Airbnb guest would have been given no unit code by us and none by
-- Airbnb either. Identical in shape to the blanket-Nickel skip, still armed.
update property_locks set airbnb_managed = true  where lock_name = 'Port Colborne';
update property_locks set airbnb_managed = false where lock_name = 'Royal York Apt 1';

notify pgrst, 'reload schema';

-- ── verify: 6 rows, every one carrying a device id ───────────────────────────
select property_id, lock_name, airbnb_managed, schlage_device_id
from property_locks
where active = true
order by property_id, lock_name;
