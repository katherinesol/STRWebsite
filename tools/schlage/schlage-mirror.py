#!/usr/bin/env python3
"""
MIRROR AIRBNB'S CODE ONTO OUR DOORS.

    python schlage-mirror.py            show what it WOULD change
    python schlage-mirror.py --commit   actually change it

THE RULE, stated by the owner: our code must always match Airbnb's code for the
other doors on that property.

WHY IT WAS EVER DIFFERENT.  door_code is filled from the iCal field labelled
"Phone Number (Last 4 Digits)" — Airbnb's GUEST CONTACT field.  We adopted those
digits as the code, assuming Airbnb would use the same ones on the lock it owns.
It usually does: Kristine 6286, Jerry 2915, Ziyue 5105 all agreed.  It did not
for Aelita Sun — Airbnb set 1616 on Apt 2 while we put 8112 on Royal Side and the
Emergency Exit.  Airbnb tells her 1616; 1616 does not open the side door; she
cannot get into the building.

Guessing the code from a contact field was always the bug.  This reads the code
Airbnb actually set and mirrors it, so there is one code per stay everywhere.

IT ALSO CORRECTS door_code, because the guest-support concierge answers "what is
my code?" out of that column.  Leaving it stale means the AI confidently tells
the guest a code that does not work — a second wrong answer from a second mouth.

WHAT IT WILL NOT TOUCH.  Only codes this project created, recognised by our own
naming ("Guest · platform · date", "Reprogrammed · NNNN").  The locks also hold
Airbnb's own backups, staff codes (AMZN, Alex, Dan, Daniel, Ken, Liz, fam) and
the owner's master code, which appears on all five doors.  None of those is ours
to remove, and a prune that did not know the difference would delete the owner's
own way in.

MID-STAY IS ADD-ONLY.  If the guest is already on site, the new code is added but
the old one is left alone — pulling a working code out from under someone who is
standing at the door is the one failure worse than a mismatch.
"""

import os, re, ssl, sys, json, urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from schlage_creds import get_credentials

COMMIT = "--commit" in sys.argv

#  A fixed -04:00 is EDT and expires on 2026-11-01. Claudine Krol is 2026-10-02
#  so nothing today would have caught it, and the first stay past the changeover
#  would have been written an hour out — the same shape of error as the 4-hour
#  window Seam was quietly applying. ZoneInfo knows when the offset changes.
TOR = ZoneInfo("America/Toronto")

SCHLAGE_TO_OURS = {
    "Port Colborne": "Port Colborne",
    "Royal Side": "Royal Side",
    "Royal York Apt 1": "Royal York Apt 1",
    "Apt 2": "Apt 2",
    "Royal York Apt 2 Emergency Exit": "Apt 2 Emergency Exit",
}
OURS_TO_SCHLAGE = {v: k for k, v in SCHLAGE_TO_OURS.items()}

# Airbnb's per-stay code: "09/01 Aelita 2a2Waj"
AIRBNB_STAY = re.compile(r"^(\d{2})/(\d{2})\s+(\S+)\s+(\S+)$")


def _ctx():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        print("  certifi not installed — pip install certifi"); sys.exit(1)


_CTX = _ctx()


def env():
    e = {}
    with open(os.path.expanduser("~/Desktop/rental-direct/.env.local")) as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                e[k.strip()] = v.strip().strip('"').strip("'")
    return e


def sb(path, e, method="GET", body=None):
    url = f"{e['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "apikey": e["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {e['SUPABASE_SERVICE_ROLE_KEY']}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    })
    with urllib.request.urlopen(req, context=_CTX) as r:
        txt = r.read().decode()
        return json.loads(txt) if txt else []


def ours(name):
    n = (name or "").strip()
    return ("·" in n) or n.startswith("Reprogrammed")


def main():
    e = env()
    today = datetime.now(timezone.utc).date().isoformat()

    locks = sb("property_locks?select=property_id,lock_name,airbnb_managed,schlage_device_id&active=eq.true", e)
    if any(l.get("schlage_device_id") is None for l in locks):
        print("!! schlage_device_id is not populated yet — run supabase/schlage_device_id.sql first.")
        sys.exit(1)

    bookings = sb(
        "calendar_blocks?select=id,guest_name,platform,property_id,start_date,end_date,door_code"
        f"&platform=eq.airbnb&status=neq.cancelled&end_date=gte.{today}&order=start_date", e)

    user, pw = get_credentials()
    from pyschlage import Auth, Schlage
    from pyschlage.code import AccessCode, TemporarySchedule
    schlage = Schlage(Auth(user, pw))
    devices = {l.name: l for l in schlage.locks()}
    cache = {}

    def codes_on(sname):
        if sname not in cache:
            lk = devices.get(sname)
            if lk is None:
                cache[sname] = []
            else:
                lk.refresh_access_codes()
                cache[sname] = list((lk.access_codes or {}).values())
        return cache[sname]

    print(f"{'DRY RUN — nothing will change' if not COMMIT else 'COMMITTING'}\n")
    changes = 0

    for b in bookings:
        prop = b["property_id"]
        plocks = [l for l in locks if l["property_id"] == prop]
        abnb = [l for l in plocks if l.get("airbnb_managed")]
        if not abnb:
            continue                                  # no Airbnb door here; our code stands

        ourcode = "".join(c for c in str(b.get("door_code") or "") if c.isdigit())[-4:]
        started = b["start_date"] <= today

        # find Airbnb's per-stay code on the Airbnb-managed lock
        #
        #  BOTH date and name must agree where we have a name. Either alone would
        #  eventually put one guest's code on another guest's door.
        #
        #  BUT SOME BOOKINGS HAVE NO NAME. Airbnb's iCal feed does not always
        #  carry one, so three upcoming stays sit in the database as NULL. The
        #  first version of this demanded a name match, which those rows can never
        #  satisfy — so they reported "Airbnb has not set its code yet" forever,
        #  including after Airbnb had set it. A permanent silent miss on real
        #  stays, one of them at a property with an Airbnb-managed door.
        #
        #  So: no name, match on date alone — but ONLY if exactly one Airbnb code
        #  carries that date. Two stays starting the same day at one property is
        #  the case where a date-only match would guess, and guessing is the thing
        #  this script exists to stop. Airbnb writes the guest's first name into
        #  its own label, so a date-only match also tells us who it is.
        mm, dd = b["start_date"][5:7], b["start_date"][8:10]
        gname = (b.get("guest_name") or "").strip()
        first = gname.split()[0].lower() if gname else None
        abnb_code = None
        abnb_first = None
        ambiguous = False

        for l in abnb:
            hits = []
            for ac in codes_on(OURS_TO_SCHLAGE[l["lock_name"]]):
                m = AIRBNB_STAY.match((getattr(ac, "name", "") or "").strip())
                if not m or m.group(1) != mm or m.group(2) != dd:
                    continue
                if first is not None and m.group(3).lower() != first:
                    continue
                raw = getattr(ac, "access_code", None) or getattr(ac, "code", None)
                hits.append((m.group(3), str(raw).zfill(4)))
            if first is None and len(hits) > 1:
                ambiguous = True
                break
            if hits:
                abnb_first, abnb_code = hits[0]
                break

        label = f"{b.get('guest_name') or '(no name on booking)'} · {b['start_date']}"
        if ambiguous:
            print(f"  {label:<40} AMBIGUOUS — several Airbnb codes on {b['start_date']}"
                  f" and no guest name to tell them apart. Resolve by hand.")
            continue
        if not abnb_code:
            why = ("no guest name yet; will match on date alone once Airbnb sets the code"
                   if first is None else "Airbnb has not set its code yet")
            print(f"  {label:<40} {why} — re-check nearer the date")
            continue
        if first is None:
            print(f"  {label:<40} matched on date alone — Airbnb calls this guest '{abnb_first}'")
        if abnb_code == ourcode:
            print(f"  {label:<40} ✓ agree on {abnb_code}")
            continue

        changes += 1
        others = [l for l in plocks if not l.get("airbnb_managed")]
        print(f"\n  ⚠ {label}")
        print(f"      Airbnb set   : {abnb_code}   (on {', '.join(l['lock_name'] for l in abnb)})")
        print(f"      we recorded  : {ourcode or '—'}")
        print(f"      our doors    : {', '.join(l['lock_name'] for l in others) or '(none)'}")
        print(f"      → put {abnb_code} on our doors, set door_code = {abnb_code}"
              + ("" if started else f", remove our old {ourcode}") )
        if started:
            print("      (stay in progress — ADD ONLY, the old code is left working)")

        if not COMMIT:
            continue

        start_dt = datetime.strptime(b["start_date"] + " 16:00", "%Y-%m-%d %H:%M").replace(tzinfo=TOR)
        end_dt = datetime.strptime(b["end_date"] + " 11:00", "%Y-%m-%d %H:%M").replace(tzinfo=TOR)

        for l in others:
            sname = OURS_TO_SCHLAGE[l["lock_name"]]
            lk = devices.get(sname)
            if lk is None:
                print(f"      !! {sname} not on the account — skipped")
                continue
            existing = codes_on(sname)
            if any(str(getattr(c, "access_code", None) or getattr(c, "code", "")).zfill(4) == abnb_code
                   for c in existing):
                print(f"      {l['lock_name']}: {abnb_code} already present")
            else:
                try:
                    lk.add_access_code(AccessCode(
                        name=f"{b.get('guest_name')} · airbnb · {b['start_date']}",
                        code=abnb_code,
                        schedule=TemporarySchedule(start=start_dt.astimezone(timezone.utc),
                                                   end=end_dt.astimezone(timezone.utc)),
                    ))
                    print(f"      {l['lock_name']}: added {abnb_code}")
                except Exception as ex:
                    print(f"      {l['lock_name']}: FAILED to add — {ex}")
                    continue

            if not started and ourcode and ourcode != abnb_code:
                for c in existing:
                    cc = str(getattr(c, "access_code", None) or getattr(c, "code", "")).zfill(4)
                    if cc == ourcode and ours(getattr(c, "name", "")):
                        try:
                            c.delete()
                            print(f"      {l['lock_name']}: removed our stale {ourcode}")
                        except Exception as ex:
                            print(f"      {l['lock_name']}: could not remove {ourcode} — {ex}")
            cache.pop(sname, None)

        sb(f"calendar_blocks?id=eq.{b['id']}", e, "PATCH", {"door_code": abnb_code})
        print(f"      door_code updated to {abnb_code} (the concierge now answers correctly)")

    print(f"\n{changes} booking(s) mismatched." + ("" if COMMIT else "  Re-run with --commit to apply."))


if __name__ == "__main__":
    main()
