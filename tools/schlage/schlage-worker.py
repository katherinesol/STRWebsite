#!/usr/bin/env python3
"""
THE WORKER — the execution half of the lock migration.

    python schlage-worker.py            show what it WOULD do, change nothing
    python schlage-worker.py --commit   actually do it

The website records what should happen; this makes it happen. The Schlage
password never leaves this machine, which is the whole reason the queue exists:
a server that cannot hold the credential can still hold the intent.

FOUR PHASES, IN THIS ORDER, AND THE ORDER MATTERS:

  1. MIRROR   Airbnb sets its per-stay codes about a week ahead, so a booking
              that agreed yesterday can disagree today. Reading Airbnb's code
              FIRST means a mismatch found now is queued now and drained in the
              same run, instead of waiting for the next one.
  2. DRAIN    Execute the queue: program, revoke, reschedule.
  3. SWEEP    Read every lock and compare against what the database says should
              be there. This is the periodic check that replaces the dead Seam
              cron — verify state rather than trust a push — and it writes
              lock_status back so the website stops claiming codes are missing.
  4. LOGS     Poll each lock's history for door entries, so Door Activity keeps
              populating and checked_in_at still gets stamped without a webhook.

SERIALISED ON schlage_device_id, NEVER ON lock_id. Royal Side has TWO
property_locks rows — East and West share that side entrance — pointing at ONE
physical device. Serialising per lock_id would let two rows write to the same
lock back to back, which is the best available explanation for its reputation
for rejecting rapid writes. Work is grouped by device and paced within a group.

NOTHING IS DELETED FROM A LOCK A GUEST IS STANDING AT. A reschedule amends the
window in place; the delete-and-re-add fallback is refused outright while the
stay is in progress. Pulling a working code out from under someone at the door
is worse than a wrong window.
"""

import json, os, re, ssl, sys, time, urllib.request, urllib.error
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from schlage_creds import get_credentials

COMMIT       = "--commit" in sys.argv
BATCH        = 25          # rows claimed per run
MAX_ATTEMPTS = 5           # then it stays failed and loud
PACE_SECONDS = 20          # gap between writes to the SAME device
SETTLE_TRIES = 6           # after a write that did not return
SETTLE_GAP   = 20          # ~2 minutes of grace, matching schlage-bulk.py
#  ONE WRITE PER DEVICE PER RUN.
#
#  These locks reject writes in quick succession and accept them singly with
#  patience — diagnosed by hand, and the three runs so far agree: Port Colborne
#  got exactly one action and took it; the two doors given three and four
#  actions took almost nothing. schlage-bulk.py, which successfully programmed
#  every code currently on these locks, waited two minutes after a timeout and
#  never retried the call.
#
#  So the queue stops trying to be efficient. One write per device, wait it out
#  properly, and let the next run take the next one. A queue that drains slowly
#  and completely beats one that empties fast into nothing.
MAX_WRITES_PER_DEVICE = 1
TOR          = ZoneInfo("America/Toronto")

AIRBNB_STAY  = re.compile(r"^(\d{2})/(\d{2})\s+(\S+)\s+(\S+)$")   # "09/01 Aelita 2a2Waj"
LOCK_ACTION_NEEDED = "lock.action_needed"


# ─────────────────────────────── plumbing ────────────────────────────────────
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

E = env()


def sb(path, method="GET", body=None, prefer="return=representation"):
    url = f"{E['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/{path}"
    req = urllib.request.Request(
        url, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "apikey": E["SUPABASE_SERVICE_ROLE_KEY"],
            "Authorization": f"Bearer {E['SUPABASE_SERVICE_ROLE_KEY']}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        })
    try:
        with urllib.request.urlopen(req, context=_CTX, timeout=45) as r:
            t = r.read().decode()
            return json.loads(t) if t else []
    except urllib.error.HTTPError as ex:
        raise RuntimeError(f"{ex.code} {ex.read().decode()[:300]}") from None


def log_system(event_type, summary, detail=None, property_id=None):
    if not COMMIT:
        return
    try:
        sb("system_log", "POST", {
            "event_type": event_type, "summary": summary,
            "detail": detail, "property_id": property_id,
        }, prefer="return=minimal")
    except Exception as ex:
        print(f"      (could not log: {ex})")


def alert(intent, property_id, code, locks, booking_id, booking_kind, who, error, window=None):
    """The same lock.action_needed the server writes, so System Activity colours
    it red on one string wherever it came from. Leads with the instruction."""
    where = ", ".join(locks) if locks else "the property locks"
    if intent == "revoke":
        msg = f"REVOKE BY HAND: remove code {code} from {where} — {who}. It is still live on the lock."
    elif intent == "program":
        msg = f"PROGRAM BY HAND: put code {code} on {where} — {who}. The guest has no working code."
    else:
        msg = f"RESCHEDULE BY HAND: move code {code}'s window on {where} — {who}."
    log_system(LOCK_ACTION_NEEDED, msg + (f" ({error})" if error else ""), {
        "intent": intent, "code": code, "locks": locks, "booking_id": booking_id,
        "booking_kind": booking_kind, "error": error, "source": "worker",
        "starts_at": (window or {}).get("startsAt"), "ends_at": (window or {}).get("endsAt"),
    }, property_id)


def now_utc():
    return datetime.now(timezone.utc)


def iso(dt):
    #  "Z", NOT "+00:00". isoformat() emits the offset form, and when that goes
    #  into a QUERY STRING the "+" is decoded as a space — PostgREST then sees
    #  "2026-08-28T21:08:13.042608 00:00" and rejects it as 22007. The same value
    #  is fine inside a JSON body, which is why it worked everywhere except the
    #  one place the drain needed it.
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def tor_short(iso_str):
    """An ISO instant as Toronto wall-clock, which is the only form worth
    showing a human who is going to walk up to the lock."""
    if not iso_str:
        return "?"
    try:
        return datetime.fromisoformat(str(iso_str).replace("Z", "+00:00")) \
            .astimezone(TOR).strftime("%b %-d %-I:%M%p").replace("AM", "am").replace("PM", "pm")
    except Exception:
        return str(iso_str)


def tor_str(dt):
    if not dt:
        return "—"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TOR).strftime("%a %b %-d, %-I:%M %p")


def parse_ts(s):
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def code_of(ac):
    #  ZERO-PAD ON READ. pyschlage carries accessCode as an INTEGER in _json, so
    #  a code that went on as "0253" can come back as 253 — and then the write
    #  verification "is the code I just set on the lock?" compares 0253 against
    #  253, decides it never landed, and reports a correct write as a failure.
    #  Claudine Krol's code is exactly this shape. zfill is a no-op on the
    #  owner's 8-digit master, so padding is safe for every length.
    v = getattr(ac, "code", None)
    if v in (None, ""):
        v = getattr(ac, "access_code", None)
    if v is None:
        return ""
    t = str(v)
    return t.zfill(4) if len(t) < 4 else t


def ours(name):
    """A code this project created, by the names we write."""
    n = (name or "").strip()
    return ("·" in n) or n.startswith("Reprogrammed")


def sched_of(ac):
    s = getattr(ac, "schedule", None)
    return (getattr(s, "start", None), getattr(s, "end", None)) if s else (None, None)


def same_window(ac, starts, ends, tol=90, ends_only=False):
    """Within a minute and a half is the same window; Schlage rounds.

    ends_only is for a stay ALREADY UNDER WAY. Its start is history — the guest
    is inside — and the only thing that matters is when their access stops. This
    is what flagged Kristine: her expiry had already been corrected to 11am by
    hand, but the START still carried the old offset, so comparing both ends
    reported WRONG WINDOW on a code that was already right, and a reschedule was
    queued for a guest on site over a difference that could not matter."""
    st, en = sched_of(ac)
    if not en or not ends:
        return False
    if en.tzinfo is None: en = en.replace(tzinfo=timezone.utc)
    if abs((en - ends).total_seconds()) >= tol:
        return False
    if ends_only:
        return True
    if not st or not starts:
        return False
    if st.tzinfo is None: st = st.replace(tzinfo=timezone.utc)
    return abs((st - starts).total_seconds()) < tol


# ─────────────────────── state loaded once per run ───────────────────────────
class State:
    def __init__(self):
        self.today = now_utc().date().isoformat()
        self.locks = sb("property_locks?select=id,property_id,lock_name,airbnb_managed,schlage_device_id&active=eq.true")
        self.by_id = {l["id"]: l for l in self.locks}
        #  ONE PHYSICAL DEVICE CAN SERVE SEVERAL PROPERTIES. Royal Side is
        #  registered against both royal-york-east and royal-york-west because
        #  they share a side entrance. Anything that reasons about "what belongs
        #  on this lock" has to ask about ALL of them, and anything that visits
        #  each lock has to visit the DEVICE once, not once per row.
        self.props_for_device = defaultdict(set)
        self.row_for_device = {}
        for l in self.locks:
            self.props_for_device[l["schlage_device_id"]].add(l["property_id"])
            self.row_for_device.setdefault(l["schlage_device_id"], l)
        # platform + direct bookings that are not over yet
        self.plat = sb("calendar_blocks?select=id,property_id,platform,start_date,end_date,door_code,guest_name,"
                       f"early_checkin_time,late_checkout_time,checked_in_at,status&status=neq.cancelled&end_date=gte.{self.today}&order=start_date")
        self.direct = sb("bookings?select=id,property_id,check_in,check_out,lock_code,checked_in_at,booking_reference,"
                         f"guest_id&check_out=gte.{self.today}&order=check_in")
        self._devices = None

    def locks_for(self, pid):
        return [l for l in self.locks if l["property_id"] == pid]

    def in_progress_codes(self, pid):
        """Codes belonging to a stay that is happening RIGHT NOW at this
        property. These are never deleted — see the module docstring."""
        out = set()
        for b in self.plat:
            if b["property_id"] == pid and b["start_date"] <= self.today <= b["end_date"]:
                c = digits4(b.get("door_code"))
                if c: out.add(c)
        for b in self.direct:
            if b["property_id"] == pid and b["check_in"] <= self.today <= b["check_out"]:
                c = digits4(b.get("lock_code"))
                if c: out.add(c)
        return out

    def in_progress_on_device(self, devid):
        """THE GUARD THAT FAILED. phase_drain picked a representative lock row
        for the device, and for Royal Side that is the royal-york-EAST row —
        which has no bookings at all. So in_progress_codes('royal-york-east')
        was empty, the "is a guest using this code" test said no, and a delete
        was attempted on a code belonging to a guest who was in the building.
        A shared door must be asked about every property that shares it."""
        out = set()
        for pid in self.props_for_device.get(devid, ()):
            out |= self.in_progress_codes(pid)
        return out

    def expected_on_device(self, devid):
        """Every code that legitimately belongs on this physical lock, across
        every property that shares it. Asking per-property is what made all five
        of West's guests look like orphans on the door East also uses."""
        out = set()
        for pid in self.props_for_device.get(devid, ()):
            out |= self.all_expected_codes(pid)
        return out

    def all_expected_codes(self, pid):
        out = set()
        for b in self.plat:
            if b["property_id"] == pid:
                c = digits4(b.get("door_code"))
                if c: out.add(c)
        for b in self.direct:
            if b["property_id"] == pid:
                c = digits4(b.get("lock_code"))
                if c: out.add(c)
        return out


def digits4(v):
    d = "".join(ch for ch in str(v or "") if ch.isdigit())
    return d[-4:] if len(d) >= 4 else ""


def window_for_platform(b):
    return (win(b["start_date"], b.get("early_checkin_time"), False),
            win(b["end_date"], b.get("late_checkout_time"), True))


def win(date_str, time_str, checkout):
    """4pm in / 11am out, Toronto, unless overridden. ZoneInfo rather than a
    fixed offset: a hardcoded -04:00 is EDT and expires on 2026-11-01."""
    h, m = (11, 0) if checkout else (16, 0)
    if time_str:
        mm = re.match(r"(\d{1,2}):(\d{2})\s*(AM|PM)?", str(time_str), re.I)
        if mm:
            h, m = int(mm.group(1)), int(mm.group(2))
            ap = (mm.group(3) or "").upper()
            if ap == "PM" and h != 12: h += 12
            if ap == "AM" and h == 12: h = 0
    return datetime(*map(int, date_str.split("-")), h, m, tzinfo=TOR).astimezone(timezone.utc)


# ────────────────────────────── phase 1: mirror ──────────────────────────────
def phase_mirror(st, devices):
    """Our code must match Airbnb's on the other doors of that property.

    door_code was filled from the feed's "Phone Number (Last 4 Digits)" — a
    GUEST CONTACT field — on the assumption Airbnb would use the same digits on
    the lock it owns. Usually it does. It did not for Aelita Sun: Airbnb set
    1616 on Apt 2 while we put 8112 on Royal Side and the Emergency Exit, so the
    code Airbnb gave her opened her flat but not the building."""
    print("\n── 1. MIRROR — read Airbnb's code, sync ours to it ──")
    changed = 0
    for b in st.plat:
        if (b.get("platform") or "").lower() != "airbnb":
            continue
        abnb_locks = [l for l in st.locks_for(b["property_id"]) if l.get("airbnb_managed")]
        if not abnb_locks:
            continue

        mm, dd = b["start_date"][5:7], b["start_date"][8:10]
        gname = (b.get("guest_name") or "").strip()
        first = gname.split()[0].lower() if gname else None
        hits = []
        for l in abnb_locks:
            lk = devices.get(l["schlage_device_id"])
            if not lk:
                continue
            for ac in codes_on(lk):
                m = AIRBNB_STAY.match((getattr(ac, "name", "") or "").strip())
                if not m or m.group(1) != mm or m.group(2) != dd:
                    continue
                if first is not None and m.group(3).lower() != first:
                    continue
                hits.append((m.group(3), code_of(ac)))

        label = f"{gname or '(no name)'} · {b['start_date']}"
        if first is None and len(hits) > 1:
            # Two same-day stays at one property and nothing to tell them apart.
            # Guessing here puts one guest's code on another's door.
            print(f"   ! {label:<38} AMBIGUOUS — {len(hits)} Airbnb codes on that date, no name. Left alone.")
            alert("program", b["property_id"], None, [l["lock_name"] for l in abnb_locks],
                  b["id"], "platform", label, "two Airbnb codes share this date and the booking has no guest name")
            continue
        if not hits:
            continue

        abnb_first, abnb_code = hits[0]
        ourcode = digits4(b.get("door_code"))
        if abnb_code == ourcode:
            continue

        changed += 1
        print(f"   ⚠ {label:<38} Airbnb {abnb_code}  ≠  ours {ourcode or '—'}"
              + (f"   (matched on date; Airbnb calls them '{abnb_first}')" if first is None else ""))
        if not COMMIT:
            continue

        sb(f"calendar_blocks?id=eq.{b['id']}", "PATCH", {"door_code": abnb_code}, prefer="return=minimal")
        b["door_code"] = abnb_code
        starts, ends = window_for_platform(b)
        for l in st.locks_for(b["property_id"]):
            if l.get("airbnb_managed"):
                continue
            sb("rpc/queue_lock_action", "POST", {
                "p_booking_id": b["id"], "p_booking_kind": "platform", "p_lock_id": l["id"],
                "p_action": "program", "p_code": abnb_code,
                "p_starts_at": iso(starts), "p_ends_at": iso(ends),
            })
        log_system("lock.mirrored",
                   f"Synced {gname or 'a booking'}'s code to Airbnb's {abnb_code} (was {ourcode or 'blank'}) and queued our doors.",
                   {"booking_id": b["id"], "was": ourcode, "now": abnb_code}, b["property_id"])
        print(f"      door_code → {abnb_code}, our doors queued")
    if changed == 0:
        print("   all Airbnb stays agree")


# ────────────────────────────── phase 2: drain ───────────────────────────────
_code_cache = {}

def codes_on(lk, refresh=False):
    if refresh or lk.device_id not in _code_cache:
        lk.refresh_access_codes()
        _code_cache[lk.device_id] = list((lk.access_codes or {}).values())
    return _code_cache[lk.device_id]


def claim(row):
    """Atomic: the filter carries status=pending, so if another run already took
    it the PATCH matches nothing and comes back empty."""
    got = sb(f"lock_actions?id=eq.{row['id']}&status=eq.pending", "PATCH",
             {"status": "claimed", "claimed_at": iso(now_utc())})
    return bool(got)


def finish(row, ok, error=None, code_final=None):
    attempts = row["attempts"] + 1
    patch = {"attempts": attempts}
    if ok:
        patch.update({"status": "done", "done_at": iso(now_utc()), "last_error": None})
        if code_final:
            patch["code_final"] = code_final
    elif attempts >= MAX_ATTEMPTS:
        patch.update({"status": "failed", "last_error": (error or "")[:500], "done_at": iso(now_utc())})
    else:
        # Royal Side accepts writes singly, with patience. That patience is this
        # line: back off further each time rather than hammering.
        delay = min(60 * (2 ** attempts), 6 * 3600)
        patch.update({"status": "pending", "last_error": (error or "")[:500],
                      "not_before": iso(now_utc() + timedelta(seconds=delay))})
    sb(f"lock_actions?id=eq.{row['id']}", "PATCH", patch, prefer="return=minimal")
    return patch["status"]


def free_code(existing, prefer, avoid):
    """The worker owns code selection now. The server can only state a
    preference, because only this process can see what is on the device."""
    used = {code_of(a) for a in existing} | set(avoid)
    if prefer and prefer not in used:
        return prefer
    for n in range(1000, 10000):
        c = str(n)
        if c not in used:
            return c
    return None


def do_program(st, lk, row, lock_row):
    from pyschlage.code import AccessCode, TemporarySchedule
    starts, ends = parse_ts(row["starts_at"]), parse_ts(row["ends_at"])
    existing = codes_on(lk)
    want = digits4(row.get("code")) or None

    for ac in existing:
        if code_of(ac) != want:
            continue
        # already correct → skip, do not rewrite. Idempotence is what makes it
        # safe to run this as often as you like.
        if same_window(ac, starts, ends):
            return True, None, want, "already present with the right window"
        if ours(getattr(ac, "name", "")):
            # OURS, WRONG WINDOW — amend it. The first version fell through to
            # code selection here, saw the wanted code was taken (by itself),
            # and minted a DIFFERENT one: two codes on the door for one stay,
            # and the guest holding whichever we happened to write to the
            # booking. A program whose code already exists is a reschedule.
            try:
                ac.schedule = TemporarySchedule(start=starts, end=ends)
                ac.save()
                return True, None, want, "already present, window corrected in place"
            except Exception as ex:
                return False, f"code present but its window could not be corrected: {ex}", None, None
        # a code with that value exists but is not ours — Airbnb's, staff, the
        # owner's master. Leave it alone and pick a different one.
        break

    chosen = free_code(existing, want, avoid=st.in_progress_on_device(lock_row["schlage_device_id"]) - {want})
    if not chosen:
        return False, "no free 4-digit code on this lock", None, None

    label = f"{row.get('_who') or 'Guest'} · {row['booking_kind']} · {(row.get('starts_at') or '')[:10]}"
    try:
        lk.add_access_code(AccessCode(name=label, code=chosen,
                                      schedule=TemporarySchedule(start=starts, end=ends)))
    except Exception as ex:
        # A timeout is not a failure. Schlage's cloud is eventually consistent
        # and a call that did not return has often landed anyway; retrying
        # immediately is how duplicates get made.
        #  THE WAIT MUST SURVIVE ITS OWN CHECK. A lock that just timed out on a
        #  write can time out on the read that asks whether the write landed —
        #  and that exception escaped the loop, aborting the two minutes of
        #  grace on its first pass. The whole point of waiting is that the write
        #  may still arrive; giving up because the question failed defeats it.
        for _ in range(SETTLE_TRIES):
            time.sleep(SETTLE_GAP)
            try:
                if any(code_of(a) == chosen for a in codes_on(lk, refresh=True)):
                    return True, None, chosen, "landed after a timeout"
            except Exception:
                continue
        return False, f"{type(ex).__name__}: {ex}", None, None

    for _ in range(2):
        time.sleep(3)
        if any(code_of(a) == chosen for a in codes_on(lk, refresh=True)):
            return True, None, chosen, None
    return False, "accepted but did not appear on the lock", None, None


def do_revoke(st, lk, row, lock_row):
    want = digits4(row.get("code"))
    existing = codes_on(lk)
    live = st.in_progress_on_device(lock_row["schlage_device_id"])

    match = [a for a in existing if code_of(a) == want]
    if not match:
        # Reached the lock, the code is not on it. That is the desired end state,
        # not a failure — the Part A lesson. Crying wolf here would make every
        # tidy cancellation raise an alert and the red events stop being read.
        return True, None, None, "already absent"
    if want in live:
        return False, "a guest is currently using this code — refusing to remove it", None, None
    for a in match:
        if not ours(getattr(a, "name", "")):
            # Airbnb's backups, staff codes, the owner's own master code.
            return False, f"code {want} on this lock was not created by us (named '{getattr(a,'name','')}') — not ours to delete", None, None
    try:
        for a in match:
            a.delete()
    except Exception as ex:
        return False, f"{type(ex).__name__}: {ex}", None, None
    return True, None, None, f"removed {len(match)} code(s)"


def do_reschedule(st, lk, row, lock_row):
    starts, ends = parse_ts(row["starts_at"]), parse_ts(row["ends_at"])
    want = digits4(row.get("code"))
    existing = codes_on(lk)
    match = [a for a in existing if code_of(a) == want]
    if not match:
        return do_program(st, lk, row, lock_row)      # nothing to move — create it
    ac = match[0]
    if same_window(ac, starts, ends):
        return True, None, want, "window already correct"

    from pyschlage.code import TemporarySchedule
    try:
        ac.schedule = TemporarySchedule(start=starts, end=ends)
        ac.save()
        return True, None, want, "window amended in place"
    except Exception as ex:
        # The fallback is delete-and-re-add, and it is REFUSED outright while the
        # stay is in progress. There is a window between the two calls where the
        # door has no code, and a guest standing at it in that window is locked
        # out of a stay they are paying for.
        if want in st.in_progress_on_device(lock_row["schlage_device_id"]):
            return False, f"amend failed ({ex}) and the guest is on site — refusing delete-and-re-add", None, None
        try:
            ac.delete()
            time.sleep(4)
            _code_cache.pop(lk.device_id, None)
            return do_program(st, lk, row, lock_row)
        except Exception as ex2:
            return False, f"amend failed ({ex}); re-add failed ({ex2})", None, None


def phase_drain(st, devices):
    print("\n── 2. DRAIN — execute the queue ──")
    rows = sb(f"lock_actions?status=eq.pending&not_before=lte.{iso(now_utc())}"
              f"&order=created_at&limit={BATCH}")
    if not rows:
        print("   queue empty")
        return
    # Grouped by DEVICE, not by lock row: Royal Side is one lock with two rows.
    groups = defaultdict(list)
    for r in rows:
        groups[r["schlage_device_id"]].append(r)
    print(f"   {len(rows)} row(s) across {len(groups)} device(s)")

    for devid, items in groups.items():
        lock_row = next((l for l in st.locks if l["schlage_device_id"] == devid), None)
        lname = lock_row["lock_name"] if lock_row else devid[:8]
        lk = devices.get(devid)
        print(f"\n   ▸ {lname}  ({len(items)} action(s))")
        if lk is None:
            print(f"      !! device not on the account — all rows failed")
            for r in items:
                if COMMIT and claim(r): finish(r, False, "device not found on the Schlage account")
            continue

        wrote = 0
        for i, r in enumerate(items):
            if COMMIT and wrote >= MAX_WRITES_PER_DEVICE:
                print(f"      {r['action']:<11} {r.get('code') or '—':<6} "
                      f"held for the next run — one write per device")
                continue
            who = describe(st, r)
            r["_who"] = who
            head = (f"      {r['action']:<11} {r.get('code') or '—':<6} {who}"
                    + (f"   [{tor_short(r.get('starts_at'))} → {tor_short(r.get('ends_at'))}]"
                       if r.get('ends_at') else ""))
            if not COMMIT:
                print(head + "   (dry run)")
                continue
            if not claim(r):
                print(head + "   already claimed by another run — skipped")
                continue
            if i:
                # pacing, per device: this is the rapid-write problem made structural
                time.sleep(PACE_SECONDS)
            fn = {"program": do_program, "revoke": do_revoke, "reschedule": do_reschedule}[r["action"]]
            try:
                ok, err, final, note = fn(st, lk, r, lock_row)
            except Exception as ex:
                ok, err, final, note = False, f"{type(ex).__name__}: {ex}", None, None
            wrote += 1
            state = finish(r, ok, err, final)
            print(head + f"   → {state}" + (f"  ({note})" if note else "") + (f"  {err}" if err else ""))

            if ok and final and final != digits4(r.get("code")):
                # collision resolved — the booking must learn the real code
                tbl, col = ("calendar_blocks", "door_code") if r["booking_kind"] == "platform" else ("bookings", "lock_code")
                sb(f"{tbl}?id=eq.{r['booking_id']}", "PATCH", {col: final}, prefer="return=minimal")
                print(f"         code collision — programmed {final}, booking corrected")
            if not ok:
                #  A GUEST WHO IS IN THE BUILDING DOES NOT WAIT FOR THE BACKOFF.
                #  The ladder is 60s, 2m, 4m, 8m... and only alerts after five
                #  attempts, which is right for a booking three weeks out and
                #  wrong for someone whose code expires tomorrow morning. If the
                #  code belongs to a stay in progress, say so on the FIRST
                #  failure so it can be fixed in the Schlage app by hand.
                live = digits4(r.get("code")) in st.in_progress_on_device(r["schlage_device_id"])
                if live and state != "failed":
                    alert(r["action"], r["property_id"], r.get("code"), [lname],
                          r["booking_id"], r["booking_kind"], who,
                          f"GUEST IS ON SITE — {err}",
                          {"startsAt": r.get("starts_at"), "endsAt": r.get("ends_at")})
                    print(f"         guest on site — alert raised immediately, not after {MAX_ATTEMPTS} tries")
                if state == "failed":
                    alert(r["action"], r["property_id"], r.get("code"), [lname],
                          r["booking_id"], r["booking_kind"], who, err,
                          {"startsAt": r.get("starts_at"), "endsAt": r.get("ends_at")})
                    print(f"         gave up after {MAX_ATTEMPTS} attempts — alert raised")


def describe(st, r):
    if r["booking_kind"] == "platform":
        b = next((x for x in st.plat if x["id"] == r["booking_id"]), None)
        return f"{(b or {}).get('guest_name') or 'a stay'} · {(b or {}).get('start_date') or '?'}"
    b = next((x for x in st.direct if x["id"] == r["booking_id"]), None)
    return f"{(b or {}).get('booking_reference') or 'direct booking'} · {(b or {}).get('check_in') or '?'}"


# ─────────────────────── phase 3: sweep + lock_status ────────────────────────
def phase_sweep(st, devices):
    """Verify state rather than trust a push. Reads every lock and compares it
    with what the database says should be there, then writes lock_status back in
    the shape the UI already reads — which is what clears the stale 'missing'
    that has been showing against codes that are demonstrably present."""
    print("\n── 3. SWEEP — what is actually on each lock ──")
    orphans = []

    for devid, lk_row in st.row_for_device.items():
        lk = devices.get(devid)
        if lk is None:
            continue
        on_lock = codes_on(lk, refresh=True)
        expected = st.expected_on_device(devid)
        for ac in on_lock:
            c = code_of(ac)
            nm = getattr(ac, "name", "") or ""
            if ours(nm) and c not in expected:
                orphans.append((lk_row["lock_name"], c, nm))

    # bookings → lock_status, honestly
    for b in st.plat:
        write_status(st, devices, b, "platform")
    for b in st.direct:
        write_status(st, devices, b, "direct")

    if orphans:
        print(f"\n   ORPHANS — our code, no matching booking ({len(orphans)}):")
        for lname, c, nm in orphans:
            print(f"      {lname}: {c}  '{nm}'")
        # NOT auto-deleted. It might be a booking whose dates moved, a stay that
        # was cancelled before the queue existed, or a code someone added on
        # purpose. A human decides; the worker only points.
        if COMMIT:
            alert("revoke", orphans[0][0], None, [o[0] for o in orphans], None, None,
                  "orphan codes with no matching booking",
                  "; ".join(f"{o[1]} on {o[0]} ('{o[2]}')" for o in orphans))
    else:
        print("\n   no orphans")


def write_status(st, devices, b, kind):
    pid = b["property_id"]
    code = digits4(b.get("door_code") if kind == "platform" else b.get("lock_code"))
    start = b["start_date"] if kind == "platform" else b["check_in"]
    end = b["end_date"] if kind == "platform" else b["check_out"]
    is_airbnb = (b.get("platform") or "").lower() == "airbnb" if kind == "platform" else False
    if kind == "platform":
        starts, ends = window_for_platform(b)
    else:
        starts, ends = win(start, None, False), win(end, None, True)

    doors = []
    for l in st.locks_for(pid):
        if is_airbnb and l.get("airbnb_managed"):
            continue                                    # Airbnb codes that door
        lk = devices.get(l["schlage_device_id"])
        if lk is None:
            doors.append({"lock": l["lock_name"], "code": code or None,
                          "status": "missing", "scheduled": False, "errored": True})
            continue
        match = [a for a in codes_on(lk) if code and code_of(a) == code]
        if not match:
            doors.append({"lock": l["lock_name"], "code": code or None,
                          "status": "missing", "scheduled": False, "errored": False})
            continue
        ac = match[0]
        started = start <= st.today
        right = same_window(ac, starts, ends, ends_only=started)
        actual_end = sched_of(ac)[1]
        doors.append({
            "lock": l["lock_name"], "code": code,
            # pyschlage reports what Schlage's CLOUD holds; unlike Seam it cannot
            # say whether the device itself has taken the code. So a stay that has
            # begun and whose code is present reads 'set'; one still ahead reads
            # 'unset' and scheduled, which is what the UI already expects.
            "status": "set" if started else "unset",
            "scheduled": not started and right,
            "errored": not right,
            # SHOW THE WINDOW, do not merely judge it. Reporting "WRONG WINDOW"
            # without saying what the window actually is sent a reschedule at a
            # guest who was already correct. Whatever this flags next, the
            # numbers are on the line beside it.
            "ends_actual": (actual_end.isoformat() if actual_end else None),
            "ends_expected": ends.isoformat(),
        })

    if not doors:
        return

    #  DRIFT GETS CORRECTED, NOT JUST REPORTED.
    #
    #  The sweep found wrong windows for two days running and did nothing about
    #  them, because reporting was all it was built to do. Every code Seam wrote
    #  carries a 4-hour offset — Kristine's expired 7am on an 11am checkout — and
    #  that will not fix itself.
    #
    #  A STAY IN PROGRESS IS NEVER AUTO-CORRECTED. It gets an alert instead.
    #  A guest who is in the building has working access right now, and today
    #  proved what happens when an automated write goes at a live occupant's
    #  code: the amend failed, the fallback ran, and a delete was attempted on a
    #  code someone was relying on. Whatever the queue could gain here is not
    #  worth that, and a checkout-day expiry is a five-second fix by hand.
    #
    #  This is also what keeps the worker off Jerry's lock while he is checked
    #  in — by rule rather than by naming him, so it still holds for the next
    #  guest and the one after.
    started_now = start <= st.today <= end
    for d in doors:
        if not d["errored"] or d["status"] == "missing" or not code:
            continue
        lock_row = next((l for l in st.locks_for(pid) if l["lock_name"] == d["lock"]), None)
        if not lock_row:
            continue
        if started_now:
            print(f"      ! {d['lock']} window is wrong and the guest is ON SITE — "
                  f"fix by hand, not queued")
            if COMMIT:
                alert("reschedule", pid, code, [d["lock"]], b["id"], kind,
                      f"{b.get('guest_name') or b.get('booking_reference') or 'guest'} is currently on site",
                      f"window ends {tor_short(d.get('ends_actual'))}, should end {tor_short(d.get('ends_expected'))}",
                      {"startsAt": iso(starts), "endsAt": iso(ends)})
            continue
        print(f"      → {d['lock']} window drift queued for correction")
        if COMMIT:
            try:
                sb("rpc/queue_lock_action", "POST", {
                    "p_booking_id": b["id"], "p_booking_kind": kind,
                    "p_lock_id": lock_row["id"], "p_action": "reschedule",
                    "p_code": code, "p_starts_at": iso(starts), "p_ends_at": iso(ends),
                })
            except Exception as ex:
                print(f"        could not queue: {ex}")

    ready = all(d["status"] == "set" or d["scheduled"] for d in doors)
    bad = any(d["errored"] or d["status"] == "missing" for d in doors)
    hrs = (datetime.fromisoformat(start).replace(tzinfo=TOR) - datetime.now(TOR)).total_seconds() / 3600
    status = {"doors": doors, "all_set": ready, "needs_attention": bad,
              "within72": hrs < 72, "checked_at": iso(now_utc())}
    tag = "OK " if not bad else "!! "
    def why(d):
        if d["status"] == "missing": return f"{d['lock']}:MISSING"
        if d["errored"]:
            #  TORONTO, NOT Z. Printing UTC made every window question a mental
            #  subtraction, and a 4-hour offset is exactly the size of error that
            #  hides inside one. lock_status keeps the ISO instants for the UI;
            #  the human-facing line reads in the timezone the locks are in.
            return (f"{d['lock']}:ENDS {tor_short(d.get('ends_actual'))}, "
                    f"EXPECTED {tor_short(d.get('ends_expected'))}")
        return f"{d['lock']}:{d['status']}" + (" scheduled" if d["scheduled"] else "")
    print(f"   {tag}{(b.get('guest_name') or b.get('booking_reference') or '(no name)')[:24]:<26}"
          f"{start}  " + ", ".join(why(d) for d in doors))
    if COMMIT:
        tbl = "calendar_blocks" if kind == "platform" else "bookings"
        sb(f"{tbl}?id=eq.{b['id']}", "PATCH", {"lock_status": status}, prefer="return=minimal")


# ───────────────────────── phase 4: door logs / check-in ─────────────────────
def phase_logs(st, devices):
    """Replaces the Seam webhook. Seam pushed a door event the moment it
    happened; this asks each lock what it has seen since we last looked. The
    trade is latency for independence — entries appear at drain time, which is
    the model chosen when the event stream was dropped."""
    print("\n── 4. DOOR LOGS — entries and check-ins ──")
    seen = sb("system_log?select=created_at&event_type=eq.door.entry&order=created_at.desc&limit=1")
    since = parse_ts(seen[0]["created_at"]) if seen else now_utc() - timedelta(days=2)
    print(f"   reading entries since {tor_str(since)}")

    added = 0
    for devid, lk_row in st.row_for_device.items():
        lk = devices.get(devid)
        if lk is None:
            continue
        try:
            logs = lk.logs(limit=40, sort_desc=True)
        except Exception as ex:
            print(f"   {lk_row['lock_name']}: could not read logs — {ex}")
            continue
        by_id = {getattr(a, "access_code_id", None): a for a in codes_on(lk)}
        for e in logs:
            created = e.created_at if e.created_at.tzinfo else e.created_at.replace(tzinfo=timezone.utc)
            if created <= since:
                continue
            ac = by_id.get(e.access_code_id)
            c = code_of(ac) if ac else None
            who, bid, bkind = match_code_any(st, devid, c)
            #  AN EVENT IS NOT AN ENTRY. The message was rendered as "opened with
            #  X's code" for ANY log line that carried a code id, so programming a
            #  code produced a door-entry record — and two future guests, three
            #  weeks and five weeks out, were stamped as having checked in.
            entered = "unlock" in (e.message or "").lower()
            summary = (f"{lk_row['lock_name']} opened with {who}'s code ({c})"
                       if (who and entered)
                       else f"{lk_row['lock_name']}: {e.message}" + (f" ({c})" if c else ""))
            print(f"   + {tor_str(created)}  {summary}")
            added += 1
            log_system("door.entry", summary, {
                "code": c, "lock": lk_row["lock_name"], "device_id": lk_row["schlage_device_id"],
                "at": iso(created), "message": e.message, "source": "worker",
            }, lk_row["property_id"])

            #  First use stamps the arrival — but only a real unlock, and only
            #  for a stay that has actually begun. Neither test was here, so
            #  adding a code to a lock checked in a guest arriving in September.
            stay_started = False
            if bid:
                if bkind == "platform":
                    bb = next((x for x in st.plat if x["id"] == bid), None)
                    stay_started = bool(bb and bb["start_date"] <= st.today)
                else:
                    bb = next((x for x in st.direct if x["id"] == bid), None)
                    stay_started = bool(bb and bb["check_in"] <= st.today)
            if bid and bkind and entered and stay_started and COMMIT:
                tbl = "calendar_blocks" if bkind == "platform" else "bookings"
                rows = sb(f"{tbl}?id=eq.{bid}&select=checked_in_at")
                if rows and not rows[0].get("checked_in_at"):
                    sb(f"{tbl}?id=eq.{bid}", "PATCH", {"checked_in_at": iso(created)}, prefer="return=minimal")
                    log_system("booking.checked_in", f"{who} checked in at {lk_row['lock_name']}",
                               {"code": c, "at": iso(created)}, lk_row["property_id"])
                    print(f"      → checked in: {who}")
    if not added:
        print("   nothing new")


def match_code_any(st, devid, code):
    """A shared door's entry could belong to a guest of either property."""
    for pid in st.props_for_device.get(devid, ()):
        who, bid, kind = match_code(st, pid, code)
        if who:
            return who, bid, kind
    return None, None, None


def match_code(st, pid, code):
    if not code:
        return None, None, None
    for b in st.plat:
        if b["property_id"] == pid and digits4(b.get("door_code")) == code:
            return (b.get("guest_name") or "Guest"), b["id"], "platform"
    for b in st.direct:
        if b["property_id"] == pid and digits4(b.get("lock_code")) == code:
            return (b.get("booking_reference") or "Guest"), b["id"], "direct"
    return None, None, None


# ──────────────────────────────────── main ───────────────────────────────────
def main():
    print("THE WORKER — " + ("COMMITTING" if COMMIT else "DRY RUN, nothing will change"))
    st = State()
    print(f"  {len(st.locks)} active lock row(s), {len(st.plat)} platform + {len(st.direct)} direct booking(s) in scope")

    user, pw = get_credentials()
    from pyschlage import Auth, Schlage
    schlage = Schlage(Auth(user, pw))
    devices = {l.device_id: l for l in schlage.locks()}
    print(f"  {len(devices)} lock(s) on the Schlage account")

    missing = [l["lock_name"] for l in st.locks if l["schlage_device_id"] not in devices]
    if missing:
        print(f"  !! not found on the account: {', '.join(sorted(set(missing)))}")

    phase_mirror(st, devices)
    phase_drain(st, devices)
    phase_sweep(st, devices)
    phase_logs(st, devices)

    print("\nDone." + ("" if COMMIT else "  Re-run with --commit to apply."))


if __name__ == "__main__":
    main()
