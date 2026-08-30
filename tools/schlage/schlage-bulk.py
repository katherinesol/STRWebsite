#!/usr/bin/env python3
"""
PHASE 2 — bulk-preset upcoming booking codes.

    python schlage-bulk.py              DRY RUN: prints, touches nothing
    python schlage-bulk.py --commit     writes

THREE THINGS LEARNED THE HARD WAY TONIGHT, ALL ENCODED HERE

1. A TIMEOUT IS NOT A FAILURE.  Two writes to Royal Side raised
   "UnknownError: request timed out" and BOTH eventually landed.  Schlage's cloud
   is eventually consistent: the call does not return, the command still applies.
   So on a timeout this NEVER re-issues the write - that is how you get two
   copies of a code - it waits and looks again.

2. THE READ-BACK IS THE ONLY CONFIRMATION.  There is no is_scheduled_on_device,
   no status, no errors[].  A code counts as programmed when it appears in the
   lock's own access_codes with the exact window we asked for, and not before.

3. A LEADING ZERO SILENTLY BREAKS A CODE.  _json carries accessCode as an
   integer, so "0253" round-trips to 253 - a different, shorter code the guest
   cannot type.  Any such code is REFUSED, loudly, rather than programmed wrong.

THE DOOR RULE, evidenced rather than assumed: for an Airbnb booking, Airbnb
programs the unit door itself (Apt 2, Royal York Apt 1).  Seam's stored
lock_status for Jerry lists exactly Royal Side and Apt 2 Emergency Exit, with the
unit door absent.  The doors below reproduce that.  A NON-Airbnb booking on those
units WOULD need the unit door too - no such booking exists in this queue, so
that branch is deliberately not exercised here.
"""

import os
import sys
import time
from datetime import datetime, timezone

COMMIT = "--commit" in sys.argv

# device ids verified in Stage A; each is re-checked against its name at runtime
DEVICES = {
    "Apt 2":                           "f262207d-9390-5984-989e-403fd5ca9379",
    "Royal Side":                      "6a04a9ea-3e0c-5fb4-9b62-3e4b5638cc24",
    "Royal York Apt 2 Emergency Exit": "d270af73-0d78-5ffc-8980-5177cc422968",
    "Royal York Apt 1":                "5e6a7526-5ac1-560a-8192-daf2231002b3",
    "Port Colborne":                   "39e6ac4d-e25a-5e1f-bdc2-846562144370",
}

BOOKINGS = [
    dict(guest="Kristine Nguyen", platform="airbnb", property="royal-york-west",
         code="6286", start="2026-08-24T19:00:00Z", end="2026-08-29T15:00:00Z",
         doors=["Royal Side","Royal York Apt 2 Emergency Exit"], label="Kristine Nguyen · airbnb · 2026-08-24"),
    dict(guest="Jerry Wei", platform="airbnb", property="royal-york-west",
         code="2915", start="2026-08-29T20:00:00Z", end="2026-08-31T15:00:00Z",
         doors=["Royal Side","Royal York Apt 2 Emergency Exit"], label="Jerry Wei · airbnb · 2026-08-29"),
    dict(guest="Aelita Sun", platform="airbnb", property="royal-york-west",
         code="8112", start="2026-09-01T20:00:00Z", end="2026-09-02T15:00:00Z",
         doors=["Royal Side","Royal York Apt 2 Emergency Exit"], label="Aelita Sun · airbnb · 2026-09-01"),
    dict(guest="Ziyue Jia", platform="airbnb", property="royal-york-west",
         code="5105", start="2026-09-04T20:00:00Z", end="2026-09-07T15:00:00Z",
         doors=["Royal Side","Royal York Apt 2 Emergency Exit"], label="Ziyue Jia · airbnb · 2026-09-04"),
    dict(guest="Niki Hathaway", platform="airbnb", property="nickel-beach",
         code="4231", start="2026-09-11T20:00:00Z", end="2026-09-13T15:00:00Z",
         doors=["Port Colborne"], label="Niki Hathaway · airbnb · 2026-09-11"),
    dict(guest="Kevin Ronda", platform="airbnb", property="royal-york-west",
         code="3266", start="2026-09-12T20:00:00Z", end="2026-09-16T15:00:00Z",
         doors=["Royal Side","Royal York Apt 2 Emergency Exit"], label="Kevin Ronda · airbnb · 2026-09-12"),
    dict(guest="Stephanie Chow", platform="airbnb", property="nickel-beach",
         code="5394", start="2026-09-18T20:00:00Z", end="2026-09-20T15:00:00Z",
         doors=["Port Colborne"], label="Stephanie Chow · airbnb · 2026-09-18"),
    dict(guest="Amber Simmons", platform="airbnb", property="royal-york-west",
         code="6436", start="2026-09-25T20:00:00Z", end="2026-09-27T15:00:00Z",
         doors=["Royal Side","Royal York Apt 2 Emergency Exit"], label="Amber Simmons · airbnb · 2026-09-25"),
    dict(guest="Claudine Krol", platform="airbnb", property="royal-york-west",
         code="0253", start="2026-10-02T20:00:00Z", end="2026-10-04T15:00:00Z",
         doors=["Royal Side","Royal York Apt 2 Emergency Exit"], label="Claudine Krol · airbnb · 2026-10-02"),
    dict(guest="shawn robins", platform="vrbo", property="nickel-beach",
         code="7083", start="2026-10-10T20:00:00Z", end="2026-10-12T15:00:00Z",
         doors=["Port Colborne"], label="shawn robins · vrbo · 2026-10-10"),
]

SETTLE_TRIES = 6        # after a timeout: look this many times...
SETTLE_GAP   = 20       # ...this many seconds apart (~2 min of grace)


def iso(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def codes_on(lock):
    lock.refresh_access_codes()
    ac = lock.access_codes
    return list(ac.values()) if isinstance(ac, dict) else list(ac or [])


def find(lock, code):
    return [c for c in codes_on(lock) if str(getattr(c, "code", "")) == code]


def main():
    user, pw = os.environ.get("SCHLAGE_USERNAME"), os.environ.get("SCHLAGE_PASSWORD")
    if not user or not pw:
        print("SCHLAGE_USERNAME / SCHLAGE_PASSWORD not set."); sys.exit(1)
    from pyschlage import Auth, Schlage
    from pyschlage.code import AccessCode, TemporarySchedule

    mode = "COMMIT — codes will be written" if COMMIT else "DRY RUN — nothing will be touched"
    print("=" * 78); print(f"  BULK PRESET · {mode}"); print("=" * 78)

    now = datetime.now(timezone.utc)

    # ---- refuse unsafe codes before touching anything -------------------
    unsafe = [b for b in BOOKINGS if b["code"] and str(int(b["code"])) != b["code"]]
    if unsafe:
        print("\n  REFUSED — leading zero, would be stored as a different code:")
        for b in unsafe:
            print(f"    {b['guest']:<18} '{b['code']}' would become {int(b['code'])}  ({b['start'][:10]})")
        print("    These are SKIPPED below. Set them by hand in the Schlage app,")
        print("    then confirm the app shows the full code including the zero.")

    try:
        schlage = Schlage(Auth(user, pw))
        locks = {l.device_id: l for l in schlage.locks()}
    except Exception as e:
        print(f"\n  Sign-in failed. ({type(e).__name__}: {str(e)[:140]})"); sys.exit(1)

    # ---- every device id must still resolve to its expected name --------
    print("\n  Verifying device ids against names:")
    for name, dev in DEVICES.items():
        lk = locks.get(dev)
        actual = getattr(lk, "name", None) if lk else None
        if actual != name:
            print(f"    !! {dev} is {actual!r}, expected {name!r} — ABORT"); sys.exit(1)
        print(f"    ok  {name:<34} connected={getattr(lk,'connected',None)} battery={getattr(lk,'battery_level',None)}")

    report = []
    for b in BOOKINGS:
        print("\n" + "-" * 78)
        print(f"  {b['guest']}  ({b['platform']}, {b['property']})  code {b['code']}")
        print(f"    {b['start']} → {b['end']}")

        if not b["code"]:
            print("    SKIP — no code on the booking (VRBO publishes none; enter by hand)")
            report.append((b["guest"], "SKIP no code")); continue
        if str(int(b["code"])) != b["code"]:
            print("    SKIP — leading zero, see the refusal above")
            report.append((b["guest"], "SKIP leading zero")); continue
        if iso(b["end"]) < now:
            print("    SKIP — stay already ended")
            report.append((b["guest"], "SKIP past")); continue

        # ---- NEVER TOUCH A STAY THAT IS UNDER WAY -----------------------
        #  Replacing a code is delete-then-add, and on this account an add can
        #  time out for minutes before it lands.  For a guest who has already
        #  checked in, that gap is a real lockout with someone standing at the
        #  door.  Kristine Nguyen's code was found with a window four hours
        #  adrift from Seam's record; correcting it mid-stay would have risked
        #  exactly that, for a stay ending the next morning.
        #  Report the discrepancy, change nothing, let the stay finish.
        if iso(b["start"]) <= now <= iso(b["end"]):
            print("    IN PROGRESS — guest is on site. Not touching their code.")
            for dname in b["doors"]:
                lk = locks[DEVICES[dname]]
                try:
                    got = find(lk, b["code"])
                except Exception:
                    print(f"      {dname}: could not read")
                    report.append((f"{b['guest']} / {dname}", "IN PROGRESS, unread")); continue
                if not got:
                    print(f"      {dname}: !! CODE IS ABSENT and the guest is on site")
                    report.append((f"{b['guest']} / {dname}", "IN PROGRESS, NO CODE <<<")); continue
                sc = getattr(got[0], "schedule", None)
                st, en = getattr(sc, "start", None), getattr(sc, "end", None)
                if st == iso(b["start"]) and en == iso(b["end"]):
                    print(f"      {dname}: present, window correct")
                    report.append((f"{b['guest']} / {dname}", "IN PROGRESS, ok"))
                else:
                    print(f"      {dname}: present, window differs — {st} → {en}")
                    print(f"        expected {b['start']} → {b['end']}")
                    report.append((f"{b['guest']} / {dname}", "IN PROGRESS, window differs"))
            continue

        start, end = iso(b["start"]), iso(b["end"])
        for dname in b["doors"]:
            lk = locks[DEVICES[dname]]
            try:
                present = find(lk, b["code"])
            except Exception as e:
                print(f"    {dname}: could not read ({type(e).__name__}) — UNKNOWN")
                report.append((f"{b['guest']} / {dname}", "READ FAILED")); continue

            if len(present) > 1:
                print(f"    {dname}: !! {len(present)} copies already — fix by hand")
                report.append((f"{b['guest']} / {dname}", "DUPLICATES")); continue

            if present:
                s = getattr(present[0], "schedule", None)
                if getattr(s, "start", None) == start and getattr(s, "end", None) == end:
                    print(f"    {dname}: already correct — nothing to do")
                    report.append((f"{b['guest']} / {dname}", "ALREADY OK")); continue
                print(f"    {dname}: present with wrong window "
                      f"({getattr(s,'start',None)} → {getattr(s,'end',None)})")
                if not COMMIT:
                    print("      would REPLACE"); report.append((f"{b['guest']} / {dname}", "would replace")); continue
                try:
                    present[0].delete(); print("      old one removed")
                except Exception as e:
                    print(f"      could not remove: {type(e).__name__} — SKIPPING")
                    report.append((f"{b['guest']} / {dname}", "STALE — FIX BY HAND")); continue

            if not COMMIT:
                print(f"    {dname}: would SET {b['code']}")
                report.append((f"{b['guest']} / {dname}", "would set")); continue

            # ---- the write. a timeout is NOT retried; it is waited out ----
            timed_out = False
            try:
                lk.add_access_code(AccessCode(name=b["label"], code=b["code"],
                                              schedule=TemporarySchedule(start=start, end=end)))
                print(f"    {dname}: accepted")
            except Exception as e:
                timed_out = True
                print(f"    {dname}: call did not return ({type(e).__name__}) — waiting, NOT retrying")

            landed = False
            tries = SETTLE_TRIES if timed_out else 2
            for i in range(tries):
                time.sleep(SETTLE_GAP if timed_out else 3)
                try:
                    got = find(lk, b["code"])
                except Exception:
                    continue
                if len(got) > 1:
                    print(f"      !! {len(got)} copies now — remove the extra by hand")
                    report.append((f"{b['guest']} / {dname}", "DUPLICATES")); landed = True; break
                if got:
                    s = getattr(got[0], "schedule", None)
                    if getattr(s, "start", None) == start and getattr(s, "end", None) == end:
                        print(f"      confirmed on the lock after {(i+1)*(SETTLE_GAP if timed_out else 3)}s")
                        report.append((f"{b['guest']} / {dname}", "CONFIRMED")); landed = True; break
                    print(f"      present but window is {getattr(s,'start',None)} → {getattr(s,'end',None)}")
                    report.append((f"{b['guest']} / {dname}", "WINDOW WRONG")); landed = True; break
            if not landed:
                print(f"      !! NOT CONFIRMED after waiting — check the Schlage app")
                report.append((f"{b['guest']} / {dname}", "NOT CONFIRMED"))

    # ---- verdict --------------------------------------------------------
    print("\n" + "=" * 78)
    OK_STATES = ("CONFIRMED", "ALREADY OK", "would set", "would replace",
                 "SKIP past", "SKIP no code", "IN PROGRESS, ok")
    bad = [r for r in report if r[1] not in OK_STATES]
    for who, state in report:
        flag = "   <<<" if (who, state) in [(w, s) for w, s in bad] else ""
        print(f"  {who:<44} {state}{flag}")
    print()
    if COMMIT:
        print(f"  {len([r for r in report if r[1]=='CONFIRMED'])} confirmed, "
              f"{len([r for r in report if r[1]=='ALREADY OK'])} already correct, "
              f"{len(bad)} needing attention.")
        if bad:
            print("  Anything flagged above is NOT on the lock. Fix before the guest arrives.")
    else:
        print("  Dry run only. Re-run with --commit to write.")
    print("=" * 78)


if __name__ == "__main__":
    main()
