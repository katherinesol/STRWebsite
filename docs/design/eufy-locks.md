# Eufy T85L1 — capability VERDICT

**Answered 19 September 2026, against the real lock on Unit 3. Not from
documentation.**

## The verdict

**The T85L1 (device type 211) cannot hold programmatically managed codes with
eufy-security-client 4.2.0 — which is the latest published version.** It is a
permanent-code lock, managed by hand in the Eufy app. It is not, and cannot
today be, a code-programming adapter.

## Why, precisely — because four earlier answers were each wrong in an
interesting way

Every failure on the way here looked like the final answer and was not. Writing
them down because the pattern is the lesson: an integration fails in layers, and
each layer imitates a verdict.

| looked like | actually was |
|---|---|
| "login failed on both backends" | the username came from the environment and the password from the Keychain — two halves of two credentials |
| "2FA blocks us" | the library accepts `connect({verifyCode})`, and `addTrustDevice()` makes it a one-time cost |
| "0 locks on the account" | `isLock()` consults a type table with no entry for 211. It is also **not the gate** — `station.addUser` checks `hasCommand`, never `isLock` |
| "no passcode commands" | `getCommands()` returns `[]` for an unmapped type. Lending type 201's table (Smart Lock C33, T85L0 — one character away) produced all five |

Each of those was a lookup miss wearing the costume of a hardware limit. The
fifth is not.

## The floor

`station.deleteUser()` — and `addUser`, and `updateUserPasscode` — have **two**
gates that raise the identical error message.

```
1.  if (!device.hasCommand(CommandName.DeviceDeleteUser))
        throw NotSupportedError("This functionality is not implemented or supported by this device")

2.  if      (device.isLockWifi() || device.isLockWifiNoFinger())  { …T8520 payload… }
    else if (device.isLockWifiR10() || device.isLockWifiR20())    { …V12 payload… }
    else if (device.isLockWifiVideo())                            { … }
    else if (device.isLockWifiT8506())                            { … }
    else
        throw NotSupportedError("This functionality is not implemented or supported by this device")
```

The second gate picks a **model-specific encrypted P2P payload encoding**. Its
predicates cover device types **51, 54, 58, 180 and 184**. Type 211 matches none
of them.

Measured at the moment of the call, on the live lock:

```
device type at call time: 211
getCommands(): deviceLockCalibration, deviceAddUser, deviceDeleteUser,
               deviceUpdateUserPasscode, deviceUpdateUserSchedule, deviceUpdateUsername
hasCommand(deviceDeleteUser): true
FAILED: This functionality is not implemented or supported by this device
```

**`hasCommand` is true and it throws anyway.** Lending the command table got past
the first gate directly into the second. The commands exist as names with nothing
behind them.

**Recognising the type and exposing the command names is not the same as being
able to talk to the lock.** That distinction is the whole finding.

## Consequences

- **Q4-Q6 are moot.** There is nothing to schedule if nothing can be written, so
  the keypad enforcement test has no subject. The lock was never written to.
- **The `lock_system` adapter design still holds** — Schlage works and the queue
  is sound. Eufy simply cannot be a code-programming adapter on this hardware.
- **Revisit if a future eufy-security-client implements the 211 payload.** The
  probe is committed and will answer in minutes. Not today.

## DO NOT patch isLockWifi() to include 211 on the tenant's lock

It is the only remaining lever and it must not be pulled here. Adding 211 to that
predicate does not implement the payload — it sends the **T8520 encoding to a
device the library was never written for**. The failure modes run from silently
ignored to a lock in a bad state, and **somebody lives behind this one**.

If that experiment is ever wanted, it belongs on a T85L1 with **nobody behind
it**. And it is an experiment, not a probe: a probe asks a question, this would
take a chance.

## For the buying decision

Kaye is choosing on cost and features. The feature that decides everything here
is whether a code can be programmed and made to expire, and **that is now a
measurement rather than a guess** — the same probe, pointed at a candidate model,
answers it in one afternoon on hardware borrowed or bought-and-returnable.

What to check before buying any Eufy lock intended to hold guest codes:

1. Its device type appears in `DeviceCommands` — else no commands at all.
2. Its device type satisfies one of `isLockWifi` / `isLockWifiNoFinger` /
   `isLockWifiR10` / `isLockWifiR20` / `isLockWifiVideo` / `isLockWifiT8506` —
   **this is the one that caught the T85L1**, and it is invisible until a write
   is attempted.
3. A scheduled code, once written, is **enforced** at the keypad — accepted and
   stored are not the same as enforced, which is what the Schlage timezone bug
   cost four hours a code to learn.

Nothing on Eufy's marketing answers any of the three.

---

# Eufy locks — capability check and adapter design

**Design only. Nothing is built. The capability is NOT confirmed.**

## The headline: the capability check cannot be completed from here

Three things block it, and the first two are blocking in the strict sense —
no amount of reading resolves them.

1. **The model is unknown.** Nothing in this system records a Eufy device. Six
   `property_locks` rows exist and every one is Schlage; `lock_actions` has 28
   rows, all keyed on `schlage_device_id`; the string "eufy" appears nowhere in
   the repository. Capability varies by model, so without the model there is no
   question to answer.
2. **Confirming it needs her Eufy account.** Every route to a Eufy lock —
   `eufy-security-client`, the MCP server, anything — authenticates with the
   account email and password. Same rule as Schlage: **that password never comes
   to me, never into `.env.local` for a cloud process, never into chat.** The
   probe runs on Katherine's Mac, as the Schlage worker does.
3. **The documentation does not settle it.** See below — this is the finding
   that matters most.

### What the documentation actually says

`eufy-security-client` is the library everything else wraps. Its documented
command surface for locks is **lock and unlock**. Passcode management —
add, update, delete a PIN — **is not in the documented API**, and neither is any
schedule parameter. Its stated device list covers T8520, S330 (T8530), C210,
C220, S230, S231, E110, E130, E20, C33 and FamiLock E34. **E30 and E31 are not
on it.**

The `eufy-lock-codes` MCP server does expose passcode tools —
`discover_locks`, `health_check`, `list_lock_codes`, `plan_create_code`,
`plan_update_code`, `plan_delete_code`, `plan_rotate_codes`, `execute_plan` —
built on that same library, and reports "creating and removing one scheduled
expiring code" during its own testing. It does **not say on which model.** It
also warns that the APIs are unofficial and "can drift", that existing plaintext
PINs are not always retrievable, and that offline or low-battery locks may not
answer live reads.

**So the honest position is: a scheduled expiring code has worked for somebody,
on some lock, at some point. That is not the same as "it works on Katherine's
lock", and the difference is the entire project.** The Schlage work already
taught this the expensive way — the locks turned out to treat `activationSecs`
as local wall-clock digits rather than an epoch, which no documentation said and
only a readback revealed.

---

## STEP 1 — the probe that answers it

A read-only script, `tools/eufy/capability-probe.py`, run by Katherine on her
Mac against her real locks. It writes nothing to any lock. It answers, in order:

| # | Question | How it is answered |
|---|---|---|
| 1 | What models are on the account? | `discover_locks` — model, serial, firmware, battery |
| 2 | What does the library think each can do? | the capability flags the discovery reports |
| 3 | Can it READ the codes already on the lock? | `list_lock_codes`, compared against what the Eufy app shows |
| 4 | Can it ADD a code? | one code, on **one lock, in a door nobody is behind**, then read back |
| 5 | Can it add a code with a SCHEDULE? | same, with a start and end an hour apart — then read back the schedule |
| 6 | Does the schedule actually bite? | the code is tried before its window and inside it |
| 7 | Can it DELETE that code? | delete, then read back and confirm it is gone |
| 8 | How long does each call take, and how often does it fail? | ten repeats, timed, failures counted |

**Question 6 is the one that decides the architecture, and it is the one no
document can answer.** A lock that *accepts* a schedule and *reports* a schedule
but does not *enforce* it is worse than one that refuses the schedule outright,
because it looks like it works. The Schlage timezone bug was exactly this shape:
every code was written successfully, reported successfully, and opened four
hours late. Only a guest at a door proved otherwise.

Steps 4–7 must run on a lock with **no guest behind it**. Nickel Beach and Royal
York West both take guests continuously; the probe waits for a genuine gap or
uses a lock not in service.

---

## The fork at question 5

### If scheduled codes work and enforce

Eufy becomes an ordinary adapter. `program` writes a code with its window
exactly as the Schlage path does, `revoke` deletes it, `reschedule` rewrites the
window. Nothing else in the queue changes.

### If they do NOT

The queue already supports the fallback — `program` and `revoke` are separate
actions with their own `not_before`, so "program at check-in, revoke at
check-out" is two intents, not a new mechanism. **But the failure surface is
materially worse, and this is the part to weigh, not wave through:**

- **A failed revoke leaves a working code in a door.** With a self-expiring code
  the lock is the backstop; without one, the queue is the only thing standing
  between a departed guest and permanent access. A retry that exhausts its
  attempts must therefore page loudly, not fail quietly into a status column.
- **It doubles the number of things that must run on time.** A late program is a
  guest at a door; a late revoke is a stranger with a key.
- **The worker must run.** It is a local script on Katherine's Mac. A closed
  laptop over a weekend is currently a delayed code; it would become a code that
  never expires.
- **The sweep becomes load-bearing.** Today it reconciles. It would need to
  actively hunt codes that should no longer exist — every code on every Eufy
  lock, checked against the bookings that justify it, with anything unexplained
  raised.

That is buildable. It is not equivalent, and the design should say so rather
than treating the two outcomes as interchangeable.

---

## STEP 2 — the adapter architecture

**Eufy is a second adapter behind the existing queue, not a parallel stack.**
Everything the Schlage work earned is reused: the intents, the supersede rule,
`attempts` + `not_before` backoff, per-device serialisation, status write-back,
the sweep, the notification path.

### The schema change

`property_locks.schlage_device_id` is the wrong name the moment there are two
systems. It is also referenced by `queue_lock_action()`, which raises on a null
and copies it onto every intent as the worker's serialisation key.

```
property_locks
  + lock_system      text not null default 'schlage'
                     check (lock_system in ('schlage','eufy'))
  + device_id        text            -- the serial, whichever system
    schlage_device_id                -- kept, populated, and no longer read

lock_actions
  + lock_system      text not null default 'schlage'
  + device_id        text not null   -- the serialisation key, system-agnostic
```

**Both columns are carried, not swapped.** 28 existing intents and six lock rows
reference `schlage_device_id`; a rename is a rewrite of the queue function and
the worker in one step, with live bookings depending on it. Add the generic
columns, backfill them, move readers one at a time, and drop nothing until every
reader has moved — the same checkpointed shape the property-content migration
used.

**The serialisation key stays physical.** Royal Side is one lock behind two
property rows; that is why the queue serialises on the device, not the lock row.
Whatever Eufy's identifier turns out to be, it must be the physical device.

### The worker

`do_program`, `do_revoke` and `do_reschedule` become thin dispatchers:

```
adapter = ADAPTERS[row["lock_system"]]     # 'schlage' -> pyschlage, 'eufy' -> eufy
adapter.program(device_id, code, starts, ends)
verify = adapter.read_codes(device_id)     # ALWAYS, and it is the verdict
```

Each adapter implements `read_codes`, `program`, `revoke`, `reschedule`, and
declares `supports_schedule`. When that is false the queue writer emits the
program/revoke pair instead of one windowed intent — **the decision lives in one
place and is made from a capability flag, not from a comment.**

### Verification is at the lock, not in the adapter's report

Non-negotiable, and it is not a general principle — it is a lesson with a date
on it. The Schlage worker reported three failures that had actually succeeded,
because an exception thrown by the *notification* after the write was read as
the write failing. Katherine was sent to hand-fix work that was already done.
Every adapter call re-reads the lock before reporting an outcome, and the
readback is what goes in the status column.

Eufy makes this harder in a specific way: **plaintext codes are not always
retrievable.** Where the code cannot be read back, the readback verifies that a
code *slot* exists with the right name and window, and the plaintext lives in
the local escrow the MCP server already implements. A slot that cannot be
verified at all is a failure, not a success with a caveat.

---

## STEP 3 — Eufy will be less reliable, and the design assumes it

This is not a hedge. Eufy has no public API and actively discourages third-party
use: unofficial clients have a documented history of causing battery drain, the
cloud path requires phoning home, and the MCP server's own documentation warns
that the APIs "can drift" and that offline or low-battery locks may simply not
answer.

What follows in the build:

- **Battery is a first-class signal.** A low battery is not a warning, it is a
  predictor of a failed write. The probe records it; the worker refuses to
  report success on a lock it could not read; Today surfaces it.
- **Timings are measured before they are trusted.** Question 8 exists so the
  retry policy is set from Eufy's real latency and failure rate, not Schlage's.
- **The manual fallback stays reachable.** Every Eufy intent that exhausts its
  retries produces the code and the instruction to enter it by hand, the same
  path that carried the Schlage work through its bad week.
- **Mixed-fleet reporting.** Today must show which system each lock is on. When
  one fleet is flakier, "the lock failed" is not enough information.

---

## Recommendation

**Run the probe before deciding anything, including whether to buy more.**
Katherine is choosing on cost and features; the feature that matters here is
whether a code can be made to expire on its own, and that is answerable in an
afternoon on hardware she already owns. If her current model cannot do it, the
same probe run against a borrowed E31 or S330 answers whether a different model
can — which turns a purchase decision from a guess into a measurement.

The MCP server is a reasonable foundation for the adapter: it is purpose-built
for exactly this problem, it already solves code escrow, and its plan-then-execute
shape matches the queue's intent-then-drain shape closely. It is not a reason to
skip the probe — it wraps the same unofficial library and inherits every one of
its limits.

## Open, for Katherine

1. **Which Eufy model(s), and where?** Model number and which door.
2. **Is there a lock with no guest behind it** this week, for questions 4–7?
3. **Does she want the probe run against a model she is considering buying**, as
   well as the one she owns?
