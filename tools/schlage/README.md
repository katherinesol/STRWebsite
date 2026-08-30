# The lock worker

These run on the owner's machine, never on the server.

`pyschlage` needs a Schlage account password, and that password is deliberately
absent from Vercel, from `.env.local` and from this repository. It is read at run
time from the macOS Keychain by `schlage_creds.py`, **which is not committed** —
copy it separately or re-create it. Without it none of these scripts start.

That constraint is what the `lock_actions` queue exists to work around: the
server records an intent it cannot itself carry out, and `schlage-worker.py`
drains it. Committed here so the execution half of the system is version
controlled alongside the half that queues the work, rather than living only in
one Desktop folder.

| script | what it does |
|---|---|
| `schlage-worker.py` | the live one. mirror → drain → sweep → door logs. `--commit` to write. |
| `schlage-mirror.py` | standalone version of the mirror phase |
| `schlage-evidence.py` | read-only. Settled which locks Airbnb actually manages. |
| `schlage-sweep.py` | the original lock_status write-back, superseded by the worker |
| `schlage-bulk.py` | the one-off advance programming run of 2026-08-27 |

Everything defaults to a dry run. `--commit` is always required to change a lock.

## Two rules learned the hard way

**One write per device per run, with two minutes of grace after a timeout.**
These locks reject writes in quick succession and accept them singly with
patience. Batching four actions at one door got nothing onto it; Port Colborne
got exactly one action and took it.

**Never write to a code a guest is currently using.** Drift on a stay in
progress raises an alert and is fixed by hand. On 2026-08-28 an automated
reschedule of an on-site guest's code failed its amend, fell through to
delete-and-re-add, and attempted a delete on a code she was relying on — because
the guard read the wrong property for a lock shared by two of them.
