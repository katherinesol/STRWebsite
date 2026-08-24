# Multi-guest access — scope

*Scope only. Nothing here is built. Written 2026-08-24, replacing the backlog
item that read "guest contact edit + visit count", which turned out to be the
small visible corner of this.*

**The need.** A booking is usually several people. Family, partners, a group of
friends — and each of them may need the door code, the house guide, the wifi, or
to ask the concierge a question at 11pm. Today only the lead booker exists as a
person, and only the lead booker can get through the guest gate. Everyone else
either texts the lead or texts the owner.

Two halves: **record** co-guests on a booking, and **let them in** to the
guest-facing features. The second half is where the care goes.

---

## 1. Data model

### The precedent to follow

`conversations` already answers "a row that belongs to a booking which might be
direct or platform": it carries `booking_id` **and `booking_kind`**. The
`create_booking_full` RPC uses the same `'direct' | 'platform'` vocabulary. A new
table should not invent a third convention.

### Proposed table

```sql
create table booking_guests (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null,
  booking_kind text not null check (booking_kind in ('direct','platform')),
  guest_id     uuid not null references guests(id) on delete cascade,
  role         text not null default 'co_guest' check (role in ('lead','co_guest')),
  added_at     timestamptz not null default now(),
  added_by     uuid,
  unique (booking_id, booking_kind, guest_id)
);
```

No foreign key on `booking_id`, because it points at one of two tables — the
same trade `conversations` already makes. The `unique` constraint is what stops
the same person being added twice to one stay.

### Keep `guest_id` on the booking

`bookings.guest_id` and `calendar_blocks.guest_id` should stay, holding the lead
booker. They are read all over — the People pages, the income API, guest-stats,
the figures endpoints, the guest matcher. Replacing them with a join is a
migration across the whole app for no gain. So: **`guest_id` remains the lead
pointer; `booking_guests` carries everyone, including a mirrored `role='lead'`
row.** Slight denormalisation, deliberately, with the join table as the
authority on *the set* and `guest_id` as a fast pointer to *the lead*.

### `bookings.guests` is a different thing and must not be conflated

That integer is party size, typed by hand and `NOT NULL`. It is not the number
of `booking_guests` rows and should not be derived from it: a family of six may
have exactly two people recorded because only two needed a door code. Keep both,
and let the UI say so — "6 guests · 2 with access".

### Is `booking_gifts` the right analogue?

No, and the difference is the point. `booking_gifts` is deliberately minimal —
`booking_id` only, note text never loaded into a page — because its whole job is
to keep something *away* from the guest. `booking_guests` must carry identity;
that is its job. What carries across is the discipline, not the shape: **the
guest-facing query must select `name` and nothing else** from this table. Email
and phone exist on `guests` and must never be reachable through a guest-facing
route.

---

## 2. Access and verification — the part that needs care

### What the gate actually does today

Read from `app/api/guest-support/verify/route.ts`, not from memory:

- `POST { code, lastName }`.
- `code` is matched `ilike` against `confirmation_code` — for platform bookings
  the Airbnb/VRBO code, for direct bookings a random `HAUS-XXXXXXXX`.
- `lastName` is matched by
  `parts[parts.length-1] === lastLower || parts.includes(lastLower)`.
- Rate limit: 8 failed attempts per IP per 15 minutes, via `verify_attempts`.
- Window: refused if `check_out` is more than 3 days ago.
- On success it returns the **door code**, the guest name, the dates, and
  **payment** — total, deposit paid, final paid.

### Three things already true that multi-guest makes worse

**The name match accepts any token, not the surname.** "Alain Roy" verifies on
`alain` *or* `roy`. Every co-guest added is another valid answer to the same
door code. For a family sharing a surname that changes little; for a group of
unrelated friends it multiplies the keys.

**The response carries payment.** Anyone who passes the gate sees the total and
what has been paid. That is already more than a co-guest should see — so
multi-guest forces the access split rather than merely suggesting it.

**The window has no upper bound.** Only `check_out` is checked, so verification
works months before arrival, as soon as the row exists. Widening who can do that
widens how early a door code can be pulled.

### Recommendation: per-person links, not more surnames

Adding co-guest surnames to the shared `(code + name)` gate multiplies keys to
the same door and leaves no record of which key was used. Instead:

**Each co-guest gets a tokenised link** — `/support?t=<token>` — with the token
stored on their `booking_guests` row. High entropy where a surname has almost
none; revocable per person; and it produces an audit trail of who opened what.
It also matches how access is really shared today, which is the lead forwarding
a link. The existing `(code + surname)` path stays, for the lead only.

**If you would rather not have tokens**, the alternative is co-guests verifying
with the code plus *their own* surname — simpler, but it strictly widens the key
space, gives no per-person revocation, and would require tightening the matcher
from any-token to actual-surname first. That tightening is worth doing either
way.

### Where this meets the parked guest-bot confidence tiers

The tiers decide *how sure the bot must be before it answers*. Multi-guest adds
a second, independent axis: *who is asking*. "Your balance is $1,240" can be
perfectly confident and still be the wrong thing to say to someone's
brother-in-law. So the parked model needs a caller-role input alongside its
confidence score — the two are orthogonal and multiplying them is the design.

Either land them together, or ship multi-guest with co-guests hard-limited to
the operational subset below, so the tier work is unaffected by it.

---

## 3. What a co-guest can reach

| | Lead | Co-guest |
|---|---|---|
| Door code, wifi, check-in/out times | yes | **yes** |
| House guide, local recommendations | yes | **yes** |
| Concierge AI — operational questions | yes | **yes** |
| Booking total, balance, deposit status | yes | **no** |
| Changing dates, cancelling | yes | **no** |
| Requests that cost money | yes | **no** |
| Other guests' contact details | no | **no** |

The payment block currently returned by `verify` becomes conditional on
`role = 'lead'`. That is a change to an existing response shape and wants
checking against whatever reads it.

---

## 4. Guest contact editing folds in as a prerequisite

Adding a co-guest **is** entering contact details, so the missing edit path is no
longer a separate small job — it is step one. Name, email and phone need a gated
endpoint with the same discipline the expense writes just got: an allowlist, no
raw body, and validation. Email in particular, since a fabricated address is what
created the duplicate-guest problem in the first place.

The visit-count and milestone fields ride along here, but they stay blocked on
the historical-stays item: Per, Alain and Jason are all multi-year repeats whose
earlier stays predate the system, so any count derived from bookings is wrong
until those can be entered.

---

## Sequencing

1. **Guest contact edit** — prerequisite, useful on its own.
2. **`booking_guests` + host-side UI** to add and remove co-guests.
3. **Per-person access tokens** and the lead/co-guest split in `verify`.
4. **Role-aware concierge**, with or after the confidence-tier work.

## Decisions needed before any of it is built

- Tokenised per-person links, or code + own surname?
- Can a co-guest use the concierge at all, or only read the guide?
- Can the lead add co-guests themselves, or host-only?
- Should the access window gain an upper bound — no verification until, say,
  7 days before check-in?

---

## Two bugs found while scoping this

**`create_booking_full` does not generate a `confirmation_code`.** Two of four
direct bookings have none — `RS-1005` and `RS-1006` (Alain Roy). Since the guest
gate matches on that column, a direct booking created through that path has **no
guest access at all**. Neither of those stays is current so nothing is broken
today, but the next one created this way would be.

**The surname matcher accepts any name token.** Worth tightening to the actual
last name regardless of what happens with multi-guest, since it roughly halves
the guesses needed for a two-word name.
