#!/usr/bin/env python3
"""READ ONLY. Dumps the raw schedule bytes for every code on every lock.

Nothing is written, amended, created or deleted. There is no --commit and no
code path that mutates anything — it exists so the working convention can be
read off the hardware instead of inferred.

WHY: Semon's code failed at the door at 2:15pm with 18:15 on it, and worked once
Katherine reset it by hand. The system builds windows as true UTC instants
(4pm Toronto -> 20:00Z) and pyschlage sends int(start.timestamp()). That is only
right if Schlage treats activationSecs as an epoch. The guest at the door says it
does not. His code is now correct, so whatever is on it IS the answer — printed
here as raw seconds, as UTC digits, and as Toronto digits, so which one the lock
actually enforces is visible rather than argued.

Run:  cd ~/Desktop && ./schlage-venv/bin/python read-windows.py
"""
import sys, subprocess
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

TOR = ZoneInfo("America/Toronto")

def get_credentials():
    """Same source the worker uses. The password never leaves this machine."""
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
    user, pw = get_credentials()
    from pyschlage import Auth, Schlage
    schlage = Schlage(Auth(user, pw))

    for lk in schlage.locks():
        print(f"\n{'='*94}\n{lk.name}\n{'='*94}")
        #  access_codes is a DICT attribute, populated by refresh_access_codes() —
        #  not a method. Calling it raised 'NoneType' object is not callable on
        #  every lock, because it is None until the refresh runs. Same access the
        #  worker's codes_on() uses.
        try:
            lk.refresh_access_codes()
            codes = list((lk.access_codes or {}).values())
        except Exception as e:
            print(f"  could not read codes: {type(e).__name__}: {e}"); continue
        if not codes:
            print("  (no codes)"); continue

        for ac in codes:
            raw = getattr(ac, "_json", {}) or {}
            code = str(raw.get("accessCode", "?")).zfill(int(raw.get("accessCodeLength", 4) or 4))
            name = getattr(ac, "name", "") or ""

            #  activationSecs and expirationSecs are TOP-LEVEL keys, not nested
            #  under a "schedule" object. Reading _json["schedule"] returned None
            #  for every code on every lock and printed PERMANENT across the
            #  board — which would have meant "no guest code ever expires", a far
            #  more alarming conclusion than the truth, arrived at by reading the
            #  wrong key. pyschlage's own parser is the authority: it treats
            #  MIN/MAX sentinels as permanent and anything else as a window.
            a, e = raw.get("activationSecs"), raw.get("expirationSecs")
            parsed = getattr(ac, "schedule", None)

            print(f"\n  {code}  {name}")
            print(f"      pyschlage parsed it as: {type(parsed).__name__ if parsed else 'None (permanent)'}")
            if a is None and e is None:
                print("      no activationSecs/expirationSecs in the payload at all")
                continue
            for label, secs in (("start", a), ("end", e)):
                if secs is None:
                    print(f"      {label}: none"); continue
                try:
                    utc = datetime.fromtimestamp(secs, tz=timezone.utc)
                except (OSError, OverflowError, ValueError):
                    print(f"      {label}: {secs}  (sentinel — permanent)"); continue
                tor = utc.astimezone(TOR)
                print(f"      {label}: {secs}")
                print(f"          as UTC digits    {utc.strftime('%a %b %-d  %H:%M')}   <- what the Schlage app shows")
                print(f"          as Toronto time  {tor.strftime('%a %b %-d  %H:%M')} {tor.strftime('%Z')}")

    print(f"""
{'='*94}
WHAT TO LOOK FOR — Semon Mbrahtu 8316, on Royal Side and Apt 2 Emergency Exit.
His code WORKS now, so his start line is the reference.

  If his start shows  as UTC digits 14:15  ->  the lock enforces the UTC DIGITS as
                                               LOCAL time. Every other code is 4
                                               hours late and must be rewritten.

  If his start shows  as UTC digits 18:15  ->  the lock enforces the true instant,
                      as Toronto     14:15     the convention was already right,
                                               and something else locked him out.

Paste this whole output back. Nothing has been changed.""")

if __name__ == "__main__":
    main()
