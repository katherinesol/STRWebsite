#!/usr/bin/env python3
"""Removes three specific, named codes. Nothing else, ever.

NOT A SWEEP. The codes are hardcoded below with the lock each sits on, so this
cannot decide for itself that something looks stale. Deciding what is stale is
exactly the judgement that once attempted a delete against a guest standing at
the door, so it is not delegated to a script — Katherine named these three.

  5105  Ziyue Jia      Royal York Apt 2 Emergency Exit   stay ended Sep 7
  5394  Stephanie Chow Port Colborne                     ours; Airbnb's 2284 is hers
  4231  Niki Hathaway  Port Colborne                     ours; Airbnb's 1874 is hers

Port Colborne is airbnb_managed, so Airbnb sets the guest codes there. 5394 and
4231 are OUR duplicates from before that rule existed. Airbnb's own codes are on
the same lock and are untouched by this.

Run:  cd ~/Desktop && ./schlage-venv/bin/python remove-codes.py
"""
import subprocess

REMOVE = {
    "Royal York Apt 2 Emergency Exit": {"5105": "Ziyue Jia — stay ended Sep 7"},
    "Port Colborne": {
        "5394": "Stephanie Chow duplicate — Airbnb's 2284 is her real code",
        "4231": "Niki Hathaway duplicate — Airbnb's 1874 is her real code",
    },
}
#  Belt and braces: these must survive. If a delete would touch one, stop.
NEVER_TOUCH = {"2284", "1874", "2840", "7083", "8316", "3266", "4780", "6436", "0253", "25213109"}

def creds():
    user = subprocess.run(["security", "find-generic-password", "-s", "schlage", "-w", "-a", "account"],
                          capture_output=True, text=True).stdout.strip()
    pw = subprocess.run(["security", "find-generic-password", "-s", "schlage", "-w"],
                        capture_output=True, text=True).stdout.strip()
    if not pw:
        import getpass
        user = user or input("Schlage email: ")
        pw = getpass.getpass("Schlage password: ")
    return user, pw

def main():
    user, pw = creds()
    from pyschlage import Auth, Schlage
    schlage = Schlage(Auth(user, pw))

    removed = kept = 0
    for lk in schlage.locks():
        want = REMOVE.get(lk.name)
        if not want:
            continue
        lk.refresh_access_codes()
        for ac in list((lk.access_codes or {}).values()):
            raw = getattr(ac, "_json", {}) or {}
            code = str(raw.get("accessCode", "")).zfill(int(raw.get("accessCodeLength", 4) or 4))
            if code not in want:
                continue
            if code in NEVER_TOUCH:
                print(f"  REFUSED  {lk.name}: {code} is on the never-touch list"); continue
            try:
                ac.delete()
                removed += 1
                print(f"  removed  {lk.name}: {code}  {getattr(ac, 'name', '')!r}")
                print(f"           {want[code]}")
            except Exception as ex:
                print(f"  FAILED   {lk.name}: {code} — {type(ex).__name__}: {ex}")
                print("           (read the lock before retrying — this worker's errors have")
                print("            reported failure for writes that landed, three times today)")

    print(f"\n  {removed} removed. Verify with read-windows.py — the live codes")
    print("  2284, 1874, 2840, 7083 must all still be on Port Colborne.")

if __name__ == "__main__":
    main()
