#!/usr/bin/env python3
"""
THE EVIDENCE SCRIPT — who actually programs which lock?

    python schlage-evidence.py

READ-ONLY.  It adds nothing, deletes nothing, changes nothing.  There is no
--commit flag because there is nothing to commit.

WHY IT EXISTS.  property_locks.airbnb_managed decides, in five separate code
paths, whether a lock is skipped for an Airbnb booking.  It is wrong on at least
one row.  And every other record that might have settled the question turns out
to be downstream of the flag itself:

  * calendar_blocks.lock_status  — written by the sweep, which skips locks BY
    READING THE FLAG.  It reports what the flag said, not what the lock holds.
  * the Aug 26 commit message    — argued "Nickel Beach has no Airbnb-coded door
    to defer to", which was inferred from the flag, not observed.
  * door_code                    — filled from the iCal field labelled "Phone
    Number (Last 4 Digits)".  That is Airbnb's GUEST CONTACT field, not an
    announcement that Airbnb set a code.  We adopted it as our convention.
  * schlage-bulk.py's doors=[]   — built from the flag.

So the database cannot answer this.  The locks can.

THE TELL IS THE NAME.  Every code we have ever created carries a name we chose:
schlage-bulk.py wrote "Guest · platform · date", Seam wrote "Guest · REF" or
"Reprogrammed · NNNN".  A code sitting on a lock with a name in NEITHER shape was
put there by something that is not us — Airbnb's integration, the Schlage app, or
a previous owner of the account.  A lock carrying foreign codes for Airbnb stays
is an Airbnb-managed lock.  A lock carrying only our names is ours.

THE SECOND TELL IS DUPLICATION.  If Airbnb programs Port Colborne and we programmed
it too (bulk did, for Niki Hathaway and Stephanie Chow), that door should now hold
TWO codes covering the same stay.  That is the double-program this is looking for.
"""

import json, os, ssl, sys, urllib.request
from collections import defaultdict
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from schlage_creds import get_credentials

TOR = timezone(timedelta(hours=-4))

# The five physical devices, from the map proved in Stage A.
DEVICES = {
    "Port Colborne":                   "39e6ac4d-e25a-5e1f-bdc2-846562144370",
    "Royal Side":                      "6a04a9ea-3e0c-5fb4-9b62-3e4b5638cc24",
    "Royal York Apt 1":                "5e6a7526-5ac1-560a-8192-daf2231002b3",
    "Apt 2":                           "f262207d-9390-5984-989e-403fd5ca9379",
    "Royal York Apt 2 Emergency Exit": "d270af73-0d78-5ffc-8980-5177cc422968",
}

# Schlage's name for a lock is not ours.  Kept explicit rather than fuzzy-matched:
# "Apt 2 Emergency Exit" vs "Royal York Apt 2 Emergency Exit" is exactly the pair
# that mis-matched once before.
SCHLAGE_TO_OURS = {
    "Port Colborne": "Port Colborne",
    "Royal Side": "Royal Side",
    "Royal York Apt 1": "Royal York Apt 1",
    "Apt 2": "Apt 2",
    "Royal York Apt 2 Emergency Exit": "Apt 2 Emergency Exit",
}


def _ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        print("  certifi not installed in this venv — run:  pip install certifi")
        sys.exit(1)


_CTX = _ssl_context()


def env():
    p = os.path.expanduser("~/Desktop/rental-direct/.env.local")
    e = {}
    with open(p) as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                e[k.strip()] = v.strip().strip('"').strip("'")
    return e


def sb(path, e):
    url = f"{e['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/{path}"
    req = urllib.request.Request(url, headers={
        "apikey": e["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {e['SUPABASE_SERVICE_ROLE_KEY']}",
    })
    with urllib.request.urlopen(req, context=_CTX) as r:
        txt = r.read().decode()
        return json.loads(txt) if txt else []


def whose(name):
    """Which system created a code, judged by the name it left behind."""
    n = (name or "").strip()
    if not n:
        return "FOREIGN (no name)"
    # schlage-bulk.py:  "Jerry Wei · airbnb · 2026-08-29"
    if n.count("·") >= 2 and any(p in n.lower() for p in ("airbnb", "vrbo", "houfy", "direct")):
        return "ours (pyschlage)"
    # Seam:  "Reprogrammed · 2915"  /  "Guest Name · RS-1002"
    if n.startswith("Reprogrammed"):
        return "ours (Seam)"
    if "·" in n:
        return "ours (Seam)"
    return "FOREIGN"


def main():
    e = env()
    user, pw = get_credentials()
    from pyschlage import Auth, Schlage

    today = datetime.now(timezone.utc).date().isoformat()
    locks_rows = sb("property_locks?select=property_id,lock_name,airbnb_managed,seam_device_id&active=eq.true", e)
    bookings = sb(
        "calendar_blocks?select=guest_name,platform,property_id,start_date,end_date,door_code"
        f"&status=neq.cancelled&end_date=gte.{today}&order=start_date", e)

    # every code we would EXPECT, per our own records
    expected = defaultdict(list)          # code -> [ (guest, platform, property, start) ]
    for b in bookings:
        c = "".join(ch for ch in str(b.get("door_code") or "") if ch.isdigit())[-4:]
        if c:
            expected[c].append((b.get("guest_name"), b.get("platform"), b.get("property_id"), b.get("start_date")))

    print("Connecting to Schlage (read-only)…")
    schlage = Schlage(Auth(user, pw))
    found = {l.name: l for l in schlage.locks()}
    print(f"  {len(found)} lock(s) on the account: {', '.join(sorted(found))}\n")

    verdicts = {}

    for sname, devid in DEVICES.items():
        ours_name = SCHLAGE_TO_OURS[sname]
        rows = [r for r in locks_rows if r["lock_name"] == ours_name]
        flag = rows[0].get("airbnb_managed") if rows else None
        props = sorted({r["property_id"] for r in rows})

        print("=" * 78)
        print(f"{sname}")
        print(f"   our lock_name : {ours_name}")
        print(f"   property rows : {', '.join(props) or '(none)'}"
              + ("   ← registered against TWO properties" if len(props) > 1 else ""))
        print(f"   flag says     : airbnb_managed = {flag}")

        lk = found.get(sname)
        if lk is None:
            print("   !! not present on the account under this name — cannot judge\n")
            verdicts[sname] = "UNKNOWN (lock not found)"
            continue

        lk.refresh_access_codes()
        codes = list((lk.access_codes or {}).values())
        print(f"   codes on lock : {len(codes)}")
        print()
        print(f"   {'code':<7}{'origin':<20}{'matches a booking?':<44}name")
        print("   " + "-" * 92)

        foreign_total = 0
        foreign_airbnb = 0
        by_code = defaultdict(list)

        for ac in sorted(codes, key=lambda c: str(getattr(c, "name", "") or "")):
            raw = getattr(ac, "access_code", None) or getattr(ac, "code", None)
            code = str(raw).zfill(4) if raw is not None else "????"
            name = getattr(ac, "name", "") or ""
            origin = whose(name)
            by_code[code].append(name)

            hits = expected.get(code, [])
            if hits:
                g, plat, prop, start = hits[0]
                match = f"{g} · {plat} · {start}"
                if len(hits) > 1:
                    match += f"  (+{len(hits)-1} more)"
            else:
                match = "— no booking in our records —"

            if origin.startswith("FOREIGN"):
                foreign_total += 1
                if hits and hits[0][1] == "airbnb":
                    foreign_airbnb += 1

            print(f"   {code:<7}{origin:<20}{match:<44}{name[:40]}")

        dupes = {c: n for c, n in by_code.items() if len(n) > 1}
        print()
        if dupes:
            print("   DUPLICATE CODES ON THIS LOCK (the double-program tell):")
            for c, names in dupes.items():
                print(f"      {c} appears {len(names)}×  →  {names}")
        else:
            print("   no duplicate codes")

        # the verdict
        if foreign_total == 0:
            v = "OURS — every code carries a name we wrote"
        elif foreign_airbnb > 0:
            v = f"AIRBNB-MANAGED — {foreign_airbnb} foreign code(s) match Airbnb stays"
        else:
            v = f"MIXED — {foreign_total} foreign code(s), none matching an Airbnb stay (staff/legacy?)"
        verdicts[sname] = v
        print(f"   VERDICT: {v}")
        print()

    print("=" * 78)
    print("SUMMARY — evidence-based rule, to compare against the flag")
    print("=" * 78)
    for sname in DEVICES:
        ours_name = SCHLAGE_TO_OURS[sname]
        rows = [r for r in locks_rows if r["lock_name"] == ours_name]
        flag = rows[0].get("airbnb_managed") if rows else None
        print(f"  {sname:<34} flag={str(flag):<6} {verdicts.get(sname)}")
    print()
    print("Paste this whole output back. Nothing was written.")


if __name__ == "__main__":
    main()
