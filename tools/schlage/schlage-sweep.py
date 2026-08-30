#!/usr/bin/env python3
"""
THE SWEEP — verify every upcoming booking's codes, then tell the website.

    python schlage-sweep.py            read + show what it WOULD write
    python schlage-sweep.py --commit   also write lock_status back

WHY THIS EXISTS.  The website renders `calendar_blocks.lock_status`, which was
written by Seam's morning cron.  That cron has stopped, so every upcoming booking
still shows the Aug 26 verdict - "missing" - while all fifteen codes are in fact
set.  Jerry's page says both doors are missing on the morning he arrives.  The
data is not just stale, it is backwards.

Nothing on the website changes.  It already reads this column; it is being fed a
lie.  This feeds it the truth instead.

THE SHAPE IS COPIED FROM THE OLD SWEEP, NOT INVENTED.  BookingDetail reads:
    lock_status.doors[]        -> { lock, code, status, scheduled, errored }
    lock_status.checked_at     -> "Last swept ..."
    lock_status.needs_attention-> the red warning line
and matches a door by  d.lock === property_locks.lock_name  - OUR name for the
lock, not Schlage's.  "Apt 2 Emergency Exit" here is "Royal York Apt 2 Emergency
Exit" in Schlage, and using the wrong one would silently match nothing and leave
every door grey.

HOW A DOOR IS JUDGED - and the one honest limitation.
  Seam could say whether a code had reached the device (is_scheduled_on_device).
  pyschlage cannot: it reports what Schlage's cloud holds.  So:
      present, window correct, stay already started -> status 'set'
      present, window correct, stay still ahead     -> status 'unset', scheduled True
      present, window WRONG                          -> errored, needs attention
      absent                                         -> status 'missing'
  The UI reads set-or-scheduled as "confirmed on the lock".  What we can honestly
  claim is "confirmed in Schlage with the right window", which is the strongest
  statement available now.  A door that fails is marked red, never glossed.

  Airbnb-managed locks are omitted from doors[] exactly as the old sweep omitted
  them - the UI shows "Airbnb manages this lock" from its own flag.
"""
import json
import ssl
import sys
import urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from schlage_creds import get_credentials

COMMIT = "--commit" in sys.argv
TOR = ZoneInfo("America/Toronto")
ENV_PATH = "/Users/katherine/Desktop/rental-direct/.env.local"

# our lock_name  ->  Schlage's device name
OURS_TO_SCHLAGE = {
    "Port Colborne": "Port Colborne",
    "Royal Side": "Royal Side",
    "Apt 2": "Apt 2",
    "Apt 2 Emergency Exit": "Royal York Apt 2 Emergency Exit",
    "Royal York Apt 1": "Royal York Apt 1",
}


def env():
    out = {}
    for line in open(ENV_PATH):
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


# macOS python.org builds ship no CA bundle, so stdlib urllib cannot verify TLS -
# pyschlage is unaffected because requests bundles certifi.  Borrow the same
# bundle rather than turning verification off: this request carries the Supabase
# service-role key, which is the last credential to send over an unverified
# connection.
def _ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        print("  certifi not installed in this venv — run:  pip install certifi")
        sys.exit(1)


_CTX = _ssl_context()


def sb(path, method="GET", body=None, e=None):
    """Supabase REST. Service key read from the project's own .env.local, so no
    second copy of a secret exists anywhere."""
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


def window(date_str, time_str, checkout):
    """Same rule the app uses: 4pm in, 11am out, Toronto, unless overridden."""
    h, m = (11, 0) if checkout else (16, 0)
    if time_str:
        import re
        mm = re.match(r"(\d{1,2}):(\d{2})\s*(AM|PM)?", time_str, re.I)
        if mm:
            h, m = int(mm.group(1)), int(mm.group(2))
            ap = (mm.group(3) or "").upper()
            if ap == "PM" and h != 12: h += 12
            if ap == "AM" and h == 12: h = 0
    local = datetime(*map(int, date_str.split("-")), h, m, tzinfo=TOR)
    return local.astimezone(timezone.utc)


def tor(dt):
    return dt.astimezone(TOR).strftime("%a %b %-d, %-I:%M %p") if dt else "—"


def main():
    e = env()
    user, pw = get_credentials()
    from pyschlage import Auth, Schlage

    today = datetime.now(timezone.utc).date().isoformat()
    locks_rows = sb("property_locks?select=property_id,lock_name,airbnb_managed&active=eq.true", e=e)
    bookings = sb(
        "calendar_blocks?select=id,guest_name,platform,property_id,start_date,end_date,"
        "door_code,early_checkin_time,late_checkout_time"
        f"&is_booking=eq.true&status=neq.cancelled&end_date=gte.{today}&order=start_date", e=e)

    schlage = Schlage(Auth(user, pw))
    devices = {l.name: l for l in schlage.locks()}
    cache = {}

    def codes_for(schlage_name):
        if schlage_name not in cache:
            lk = devices.get(schlage_name)
            if lk is None:
                cache[schlage_name] = None
            else:
                try:
                    lk.refresh_access_codes()
                    ac = lk.access_codes or {}
                    cache[schlage_name] = list(ac.values()) if isinstance(ac, dict) else list(ac)
                except Exception:
                    cache[schlage_name] = None
        return cache[schlage_name]

    now = datetime.now(timezone.utc)
    checked_at = now.isoformat().replace("+00:00", "Z")
    print("=" * 86)
    print(f"  SWEEP · {'COMMIT' if COMMIT else 'DRY RUN'} · times Toronto")
    print("=" * 86)

    wrote = 0
    for b in bookings:
        code = "".join(ch for ch in str(b.get("door_code") or "") if ch.isdigit())[-4:]
        start = window(b["start_date"], b.get("early_checkin_time"), False)
        end = window(b["end_date"], b.get("late_checkout_time"), True)
        is_air = b["platform"] == "airbnb"
        mine = [l for l in locks_rows if l["property_id"] == b["property_id"]
                and not (is_air and l["airbnb_managed"])]

        doors = []
        for l in mine:
            sname = OURS_TO_SCHLAGE.get(l["lock_name"])
            rows = codes_for(sname) if sname else None
            if rows is None:
                doors.append(dict(lock=l["lock_name"], code=code or None,
                                  status="unknown", scheduled=False, errored=True))
                continue
            got = [c for c in rows if str(getattr(c, "code", "")) == code] if code else []
            if not got:
                doors.append(dict(lock=l["lock_name"], code=code or None,
                                  status="missing", scheduled=False, errored=False))
                continue
            sc = getattr(got[0], "schedule", None)
            ok = getattr(sc, "start", None) == start and getattr(sc, "end", None) == end
            if not ok:
                doors.append(dict(lock=l["lock_name"], code=code, status="unset",
                                  scheduled=False, errored=True))
                continue
            live = start <= now <= end
            doors.append(dict(lock=l["lock_name"], code=code,
                              status="set" if live else "unset",
                              scheduled=True, errored=False))

        needs = any(d["errored"] or d["status"] == "missing" for d in doors)
        all_set = bool(doors) and all(d["status"] == "set" or d["scheduled"] for d in doors)
        hrs = (start - now).total_seconds() / 3600
        payload = dict(doors=doors, all_set=all_set, needs_attention=needs,
                       within72=hrs < 72, checked_at=checked_at, source="pyschlage")

        mark = "!!" if needs else "ok"
        print(f"\n  {mark} {b['guest_name']}  {code or '—'}  {tor(start)} → {tor(end)}")
        for d in doors:
            print(f"       {d['lock']:<26} status={d['status']:<8} scheduled={d['scheduled']}"
                  f"{'  ERRORED' if d['errored'] else ''}")
        if not COMMIT:
            print(f"       would write: {json.dumps(payload)[:150]}...")
            continue
        try:
            sb(f"calendar_blocks?id=eq.{b['id']}", "PATCH", {"lock_status": payload}, e)
            wrote += 1
            print("       written")
        except Exception as ex:
            print(f"       !! write failed: {type(ex).__name__}: {str(ex)[:90]}")

    print("\n" + "=" * 86)
    print(f"  {wrote} booking(s) updated." if COMMIT else "  Dry run. Re-run with --commit.")
    print("  The website reads this column directly — no site changes needed.")
    print("=" * 86)


if __name__ == "__main__":
    main()
