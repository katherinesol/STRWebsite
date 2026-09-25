# When Airbnb moves a booking, the doors must move with it

Scoped 24 September 2026. Not built. Rafael's stay was corrected by hand; this
is what stops the next one needing that.

## What happened

Airbnb moved a Nickel Beach reservation from 29 Sep–1 Oct to 28–30 Sep. The
website never noticed. The row kept the old dates for a fortnight and was found
only because the owner read the reservation on Airbnb and compared it by eye.

Same night count, different nights — and the original straddled the quarter
while the corrected one sits wholly in Q3, due 15 October. A moved night can
land in the wrong MAT period, which is a filing error rather than a display one.

## Why the sync cannot see it — `lib/ical-sync.ts:252`

```js
if (b.ical_uid) {
  if (feedUidsByPlatform[b.platform]?.has(b.ical_uid)) continue
} else if (feedRangesByPlatform[b.platform]?.has(`${b.start_date}|${b.end_date}`)) {
  continue
}

// Pre-UID rows only: same start, different end = the platform moved the dates.
if (!b.ical_uid) { … }
```

Three conditions, and a platform-moved start date fails all three:

1. A row **with** a UID that is still in the feed hits `continue` before any
   date is compared. The comment states the intent — *"a date change is then an
   EDIT, not a disappearance, and the row is left exactly as the owner set it"*
   — which protects the owner's manual edits and, in the same stroke, ignores
   Airbnb's.
2. The date-comparison branch runs **only** for rows with no UID.
3. Even there it keys on an unchanged `start_date` and only ever writes
   `end_date`.

So the one case it cannot handle is the common one: the platform moved the
booking and kept its UID.

## Why this matters most at Royal York, not at Nickel Beach

Rafael was harmless in access terms. Nickel Beach has one lock, Port Colborne,
and it is `airbnb_managed` — Airbnb programs it, so no intent of ours was even
queued and no window of ours was wrong.

**Royal York is the dangerous case.** A guest there passes through more than one
door: Royal Side to get into the building, then the unit door, plus Apt 2's
emergency exit. Those are separate `property_locks` rows with separate
`lock_actions` intents, each carrying its own `starts_at`/`ends_at`.

A time change that re-queued only one of them leaves a guest holding a code that
opens the building and not the flat, or the flat and not the building, at the
hour they arrive. **A partial reprogram is a locked-out guest**, and it would
look healthier than no reprogram at all — some doors would report correct.

## The build, in three parts

1. **Detect a platform move on UID-matched rows.** Compare `start_date`,
   `end_date` and the check-in/checkout times against the feed even when the UID
   is present. Then distinguish *Airbnb moved it* from *Katherine moved it*, so
   manual edits keep the protection the current `continue` was written to give
   them. The feed is authoritative for platform bookings; a local edit is not
   overwritten silently, it is surfaced as a conflict.

2. **Re-queue on a detected move.** A `reschedule` intent for the new window,
   through `queueForBooking` — not a direct write. The worker owns the door.

3. **Every lock on the entry path, not one.** `queueForBooking` already iterates
   every active lock for the property and applies the Airbnb skip rule, so the
   coverage exists — but the resync must call it once for the booking rather
   than per-lock, and a partial failure has to be loud. `queueForBooking`
   returns `failed[]` and raises `lockActionNeeded`; a resync that queues three
   of four doors must alert, never report success.

## What it must not do

Silently overwrite a date the owner set by hand. That is the behaviour the
current `continue` protects, and the reason it was written that way; the fix
keeps the protection and adds detection, rather than trading one for the other.

## Recorded alongside

`booking.dates_changed` already exists as a system-log event for the pre-UID
path, and says `REVIEW FINANCE (accommodation, tax, payout)`. The new path
should use the same event so both read identically in System Activity — and a
moved booking whose figures are already entered needs exactly that review, since
the nights may have crossed a MAT quarter.
