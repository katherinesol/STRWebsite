# Eufy T85L1 (Unit 3) — capability results

Fill this in at the keypad. The three Q6 answers are the point of the whole
exercise; everything else is already known.

## What is already established

| | |
|---|---|
| Lock | Unit 3, model **T85L1**, device type **211** |
| Other device | Fire exit, T8426, type 87 (not a lock) |
| Library | eufy-security-client 4.2.0 — the latest; type 211 is unmapped |
| Commands | `deviceAddUser` `deviceDeleteUser` `deviceUpdateUserPasscode` `deviceUpdateUserSchedule` — lent from type 201 (C33 / T85L0) |
| Users | `apps.driven187` (0000, 2 codes) · `Beamen` (0001, 1 code) |
| Plaintext codes | **Not retrievable.** `password: ''` on every entry |
| Existing schedules | all `endDate: -1` — unbounded, "always" |

## Q4 — can a code be added

- [ ] accepted
- [ ] present on readback

## Q5 — is a BOUNDED window stored

The tell: every existing code reads `endDate: -1`. If the probe's code comes back
with a real end date, the lock stored the window. If it comes back `-1`, the lock
accepted the schedule and silently discarded it.

- [ ] `is_permanent` = ______
- [ ] `expiration_time` = ______
- [ ] bounded window stored: **yes / no**

## Q6 — DOES IT ENFORCE  ← the make-or-break

Three trips to the keypad. Record all six answers.

| when | probe code | tenant's code |
|---|---|---|
| before the window opens | ☐ opened ☐ did **not** open | ☐ opened ☐ did **not** open |
| inside the window | ☐ opened ☐ did **not** open | ☐ opened ☐ did **not** open |
| after the window closes | ☐ opened ☐ did **not** open | ☐ opened ☐ did **not** open |

**PASS** = probe code: did not open → opened → did not open.

**The tenant's code must open at every step.** If it ever does not: stop, do not
run cleanup, say so immediately.

## Q7 — cleanup

- [ ] probe user removed
- [ ] `apps.driven187` / `0000` still present
- [ ] `Beamen` / `0001` still present

## What each outcome means

**Enforced** → Eufy is an ordinary adapter behind the existing `lock_actions`
queue. One `program` intent carries the window; the lock is its own backstop.

**Accepted but not enforced** → the worst case, and the one the Schlage timezone
bug wore. Codes must then be programmed at check-in and revoked at check-out as
two separate intents, and a failed revoke leaves a working code in a door — so
the sweep has to actively hunt codes that should no longer exist.

**Refused outright** → Eufy holds permanent codes only. Usable, but every stay
needs a revoke that must not be missed.
