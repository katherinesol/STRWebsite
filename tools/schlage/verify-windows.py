#!/usr/bin/env python3
"""READ ONLY. After --commit: what window is ACTUALLY on each lock?

The worker's done/pending cannot answer this. Its same_window check compares
against the QUEUE'S INTENT, and it has already false-reported a success as a
failure once: Semon's amend threw e.body.map is not a function from the
NOTIFICATION create, which runs after the window write has been accepted. The
worker saw an exception and called it pending; the lock had taken the change.

So the lock is the witness. This reads start AND end for the twelve corrected
codes and compares both to target. START ALONE IS NOT ENOUGH — Semon's start was
right and his end was four hours late, and checking only the start would have
passed him.

Run:  cd ~/Desktop && ./schlage-venv/bin/python verify-windows.py
"""
from datetime import datetime, timezone
import subprocess

TARGETS = {
    ("Royal Side", "3266"):                 (("09-12", "16:00"), ("09-16", "11:00")),
    ("Royal York Apt 2 Emergency Exit", "3266"): (("09-12", "16:00"), ("09-16", "11:00")),
    ("Royal Side", "8316"):                 (("09-10", "14:15"), ("09-12", "11:00")),
    ("Royal York Apt 2 Emergency Exit", "8316"): (("09-10", "14:15"), ("09-12", "11:00")),
    ("Royal York Apt 2 Emergency Exit", "4780"): (("09-19", "16:00"), ("09-22", "11:00")),
    ("Royal Side", "4780"):                 (("09-19", "16:00"), ("09-22", "11:00")),
    ("Royal Side", "6436"):                 (("09-25", "16:00"), ("09-27", "11:00")),
    ("Royal York Apt 2 Emergency Exit", "6436"): (("09-25", "16:00"), ("09-27", "11:00")),
    ("Port Colborne", "2840"):              (("10-01", "16:00"), ("10-05", "11:00")),
    ("Royal Side", "0253"):                 (("10-02", "16:00"), ("10-04", "11:00")),
    ("Royal York Apt 2 Emergency Exit", "0253"): (("10-02", "16:00"), ("10-04", "11:00")),
    ("Port Colborne", "7083"):              (("10-10", "16:00"), ("10-12", "11:00")),
}

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

    seen, bad = set(), 0
    print(f"\n  {'lock':<34}{'code':<7}{'start (digits)':<18}{'end (digits)':<18}result")
    print("  " + "-" * 92)
    for lk in schlage.locks():
        try:
            lk.refresh_access_codes()
            codes = list((lk.access_codes or {}).values())
        except Exception as e:
            print(f"  {lk.name:<34}could not read: {e}"); continue

        for ac in codes:
            raw = getattr(ac, "_json", {}) or {}
            code = str(raw.get("accessCode", "")).zfill(int(raw.get("accessCodeLength", 4) or 4))
            key = (lk.name, code)
            if key not in TARGETS:
                continue
            seen.add(key)
            (wd, wt), (ed, et) = TARGETS[key]
            a, e = raw.get("activationSecs"), raw.get("expirationSecs")
            fs = datetime.fromtimestamp(a, tz=timezone.utc).strftime("%m-%d %H:%M") if a else "—"
            fe = datetime.fromtimestamp(e, tz=timezone.utc).strftime("%m-%d %H:%M") if e else "—"
            ok_s, ok_e = fs == f"{wd} {wt}", fe == f"{ed} {et}"
            if not (ok_s and ok_e):
                bad += 1
            mark = "OK" if ok_s and ok_e else ("start wrong" if not ok_s else "") + (" end wrong" if not ok_e else "")
            print(f"  {lk.name:<34}{code:<7}{fs:<18}{fe:<18}{mark}")
            if not ok_s: print(f"  {'':<34}{'':<7}want {wd} {wt}")
            if not ok_e: print(f"  {'':<34}{'':<7}{'':<18}want {ed} {et}")

    missing = set(TARGETS) - seen
    for lock, code in sorted(missing):
        bad += 1
        print(f"  {lock:<34}{code:<7}{'NOT ON THE LOCK':<36}missing")

    print(f"\n  {len(seen)}/{len(TARGETS)} found · {bad} still wrong")
    print("  All twelve should read 16:00 -> 11:00, except Semon's 14:15 start (his granted early check-in)."
          if bad else "\n  ALL TWELVE CORRECT ON THE HARDWARE.")

if __name__ == "__main__":
    main()
