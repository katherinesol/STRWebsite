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

---

# Step 1 — `booking_guests`, detailed design

*Design only, nothing created. Numbers below are from the live database on
2026-08-24.*

## 1. Schema

```sql
create table booking_guests (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null,
  booking_kind  text not null check (booking_kind in ('direct','platform')),
  guest_id      uuid not null references guests(id) on delete cascade,
  role          text not null default 'co_guest' check (role in ('lead','co_guest')),
  added_at      timestamptz not null default now(),
  added_by      uuid,
  unique (booking_id, booking_kind, guest_id)
);

create index booking_guests_booking_idx on booking_guests (booking_id, booking_kind);
create index booking_guests_guest_idx   on booking_guests (guest_id);

-- exactly one lead per booking, enforced rather than assumed
create unique index booking_guests_one_lead
  on booking_guests (booking_id, booking_kind) where role = 'lead';
```

**No foreign key on `booking_id`,** because it points at one of two tables. That
is the same trade `conversations` already makes with its own `booking_id` +
`booking_kind` pair, and the vocabulary matches `create_booking_full`.

**`guest_id` cascades on delete.** Access should not outlive the person record.
This has a consequence for merges — see below.

**The partial unique index is the important line.** Without it, "who is the
lead" can quietly become two answers.

**Access tokens are deliberately not in this table yet.** They belong to step 3,
and adding the columns now would invite something to start writing them before
the access model is settled.

## 2. Migration for existing bookings

| | |
|---|---|
| direct bookings | **4** — all with `guest_id`, none cancelled |
| platform bookings (`is_booking`) | **39** — all with `guest_id` |
| **`role='lead'` rows to insert** | **43** |
| bookings that would end with no lead | **0** |

No edge cases in the enriched set: every booking that counts as a booking has a
guest. The insert should be `on conflict do nothing` so it is re-runnable.

**Two things the migration does not cover, and both need code, not SQL.**

*Nine synced platform rows have `is_booking = false` and no `guest_id`.* They are
not bookings yet, so they correctly get no lead row — but the figures endpoint is
what turns one into a booking and links its guest, and it would have to create
the lead row at the same moment. Without that, every booking enriched after the
migration has no lead. This is the same shape as the lock sweep missing synced
rows: the migration is a snapshot, and the path that creates new members of the
set has to maintain it.

*Amanda Stanek is on two bookings* — one VRBO, one Houfy. So she gets two lead
rows, which the `(booking_id, booking_kind, guest_id)` constraint permits and
should. Worth stating because a naive `unique (guest_id)` would have looked
reasonable and broken her.

## 3. What will read it

| Reader | What changes |
|---|---|
| `guest-support/verify` | The change with teeth. Today it matches the surname against the lead. After: match against **anyone** on the booking, then carry `role` into the session so the response can be scoped — the payment block becomes lead-only. |
| Concierge / chat | Needs `role` to decide what it may say. This is where multi-guest meets the parked confidence tiers: confidence and caller-role are separate axes. |
| People (`/keyholder/people`) | "On N bookings" today counts `guest_id`. It would need to decide whether being a co-guest counts. |
| Booking detail (2a) | Gains a "who is on this stay" section — the natural place to add and remove co-guests. |
| `guest-stats` | **Needs a decision.** `returning` is derived from trips. Does joining someone else's booking as a co-guest make you a returning guest? My view: no — a trip should mean a booking you led. But it must be chosen, not defaulted. |

## 4. Permissions

**RLS is defence in depth here, not the gate.** Every database read in this app
is server-side through the service role; the only browser-side Supabase client
is `set-password`, and it touches auth rather than data. So the real gate is the
API route.

- **Enable RLS with no policies** — deny by default. Service role bypasses it, so
  nothing breaks, and if an anon client ever reaches this table it gets nothing.
- **Writes**: `hasRole('owner','co-owner')`, and a named permission rather than
  reusing `money`. Adding someone to a booking is not a financial act.
- **Guest-facing reads**: scoped to the caller's own booking, selecting `name`
  and `role` only. Never email or phone — those live on `guests` and must not be
  reachable from a guest-facing route. This is the discipline `booking_gifts`
  established, applied to a table that does carry identity.

## 5. One thing I would push back on

The agreed design mirrors the lead into `booking_guests` as a `role='lead'` row
while `guest_id` stays on the booking. That is two places recording the same
fact — and this codebase has just spent a migration repairing exactly that shape
of duplication, where `guests.name` and `calendar_blocks.guest_name` drifted
apart until three guests had short names in one table and full names in the
other.

I am **not** recommending against the mirror; the alternative (join table holds
co-guests only, "everyone" is a union of two sources) makes every reader do more
work and gives the lead no token of their own. But it should ship with the drift
made hard rather than merely discouraged:

- the partial unique index above, so there is never more than one lead;
- **`merge_guests` must repoint `booking_guests.guest_id`** as it already
  repoints bookings, calendar_blocks and conversations — otherwise the cascade
  deletes the absorbed guest's access rows on merge. It also needs to handle both
  guests being on the same booking, which would collide with the unique
  constraint. **This is a third fix for the SQL round trip**, alongside the two
  `create_booking_full` owes;
- a consistency check in the migration, re-runnable, asserting every booking has
  exactly one lead and that it equals the booking's `guest_id`.

With those three, the mirror is safe. Without them it is the name-drift bug
again, with a door code attached.

## Decisions needed before creating anything

1. Does a co-guest trip count toward `returning_guest`? (My view: no.)
2. Is `added_by` worth carrying — is it useful to know who added a guest?
3. Should the migration also create lead rows for the 9 unenriched synced rows
   if they later gain a guest, or is the figures-endpoint change enough?

---

# Step 3 — access. Scope only, nothing built.

*Written 2026-08-25. All four decisions are settled; this is how they land.*

## 1. The token model

Four columns on `booking_guests`:

```sql
alter table booking_guests
  add column if not exists access_token      text unique,
  add column if not exists token_issued_at   timestamptz,
  add column if not exists token_revoked_at  timestamptz,
  add column if not exists token_last_used_at timestamptz;
```

**Generation.** 32 random bytes, base64url — 43 characters, ~192 bits. Not a
UUID: v4 has 122 bits and reads like an identifier people expect to be
guessable-adjacent. Minted only when access is granted, so a recorded co-guest
with no token is a normal state — step 2 records, step 3 admits.

**Storage: plain, not hashed** — with the reason stated so it is a choice rather
than an oversight. Hashing would mean the host can never re-display a link, only
mint a new one, and re-sending "the link I already gave you" is the common case.
Door codes are already stored plain in the same database, so hashing tokens
alone buys less than it costs. `booking_guests` has RLS enabled with no
policies, and every read goes through the service role behind an API gate.

**Revocation is `token_revoked_at`, never a delete.** A revoked row is the
record that somebody once had access and no longer does; deleting it destroys
exactly the audit the host asked for. Lookups filter `token_revoked_at is null`.

**`token_last_used_at`** turns the audit from "who was given access" into "who
actually used it", which is the more useful question after something goes wrong.

**The `/support?t=…` flow.** The token identifies a *person on a booking*, so it
resolves booking and role in one step — no code, no surname. A new
`POST /api/guest-support/verify-token` looks the token up, applies the same
window rules as the main gate, and returns the same shape with `role` attached.
The lead keeps code + surname; nothing about their path changes.

## 2. Lead-invite, and the host control that matters more

**One extra column**, because `added_by` cannot carry this: it holds an auth
user id, and a lead is a guest, not a user. Overloading it would make "who added
this person" unanswerable.

```sql
alter table booking_guests
  add column if not exists invited_by_guest_id uuid references guests(id);
```

Null means the host added them. Populated means a lead did, and names which one.

**The flow.** The lead, already verified, adds a name and email. The system mints
a token and shows them **a link to forward** — it does not send email. Sending
would mean outbound mail to an address the lead typed, from your domain,
triggered by a guest. A link the lead pastes into their own group chat is the
same outcome without that.

**A cap of 6 per booking.** Nickel Beach sleeps ten, so six co-guests plus the
lead covers a full house while stopping a lead handing out fifty links. It should
be a constant in one place, not scattered, so raising it is a one-line change.

**The host surface — the piece to get right.** On the booking's co-guest list,
each row gains: who added them (**"added by Kristine"** vs host-added), whether a
token is issued, when it was last used, and **Revoke**. Revoke kills the token
and leaves the row. A separate **Remove** still deletes the record entirely.
Those are different actions and should look different — revoking access and
erasing that access existed are not the same.

Lead-invited people should be visually distinct in the list, because that is the
set the host did not choose. Worth surfacing on Today as well —
*"2 people were given access by guests this week"* — so it is noticed rather
than discovered.

## 3. The concierge caller-role

**Filter the data, not the prompt.** A system-prompt instruction is not a
security boundary: if the model can see the balance, some phrasing will get it
out. The context builder omits money entirely for a co-guest, so there is
nothing to leak. The prompt instruction is then a courtesy that shapes the
refusal, not the thing enforcing it.

| | Lead | Co-guest |
|---|---|---|
| Door code, wifi, times, guide, local recommendations | yes | **yes** |
| Balance, total, deposit status, payment questions | yes | **no — not in context** |
| Changing dates, cancelling, anything chargeable | yes | **no** |

The refusal names who can help rather than stonewalling: *"I can't see the
booking's payment details — the lead guest can check those."*

This is the caller-role axis the parked confidence tiers need. The two multiply:
tiers answer *how sure must I be*, role answers *who is asking*. A confident
answer can still be the wrong thing to say to the wrong person.

## 4. The two-tier window, and its three messages

Measured against `check_in`, in the property's timezone:

| When | Verifies? | Sees | Message |
|---|---|---|---|
| **> 30 days** | no | — | *"Check-in details become available 30 days before arrival. Your booking is confirmed."* |
| **30 – 7 days** | yes | guide, wifi, times, local, concierge | code field reads *"Available 7 days before check-in"* |
| **< 7 days** | yes | everything | — |
| **after checkout + 3d** | no | — | *"This booking has ended."* (existing) |

The 30-day state must be a **specific message, not a 404**. A guest twenty days
out who sees "no booking found" concludes the system is broken and messages you;
one who sees "available 7 days before arrival" waits.

**And that specificity has a cost worth naming.** Saying "this booking exists but
it is too early" confirms to anyone holding a code-and-surname pair that the pair
is valid — an oracle a bare 404 does not give. The existing limit is 8 failed
attempts per IP per 15 minutes, which is IP-based and so not much against a
distributed attempt. Recommendation: ship the clear message, and tighten the
limit at the same time. Do not ship the message and leave the limit as it is.

## 5. Blast radius — this changes every guest, not only co-guests

Of the 13 live bookings on 2026-08-25:

| | count | who |
|---|---|---|
| **Lose access entirely** (>30d) | **3** | Amber Simmons (31d), Claudine Krol (38d), shawn robins (46d) |
| **Lose the door code** (7–30d) | **4** | Ziyue Jia (10d), Niki Hathaway (17d), Kevin Ronda (18d), Stephanie Chow (24d) |
| Unaffected | 6 | in-stay, past, or inside 7 days |

Seven of thirteen see less than they do today. None of them is harmed — none can
use a code weeks early — but if any has already opened the portal and bookmarked
it, the change is visible to them. **Amber Simmons sits at exactly 31 days**,
which is the boundary: it should be tested at 30 and 31, not only in the middle,
and the comparison must be on the property's local date rather than UTC or a
guest checking in tomorrow flips a day early.

## SQL this needs — one round trip, five columns

```sql
alter table booking_guests
  add column if not exists access_token       text unique,
  add column if not exists token_issued_at    timestamptz,
  add column if not exists token_revoked_at   timestamptz,
  add column if not exists token_last_used_at timestamptz,
  add column if not exists invited_by_guest_id uuid references guests(id);
```

## Build order

1. Columns, then the token mint/revoke endpoints and the host surface — testable
   without changing the shared gate at all.
2. `/support?t=` and `verify-token`, still leaving the main gate alone.
3. The concierge role filter.
4. **The window last, and on its own**, because it is the only part that changes
   behaviour for existing guests. Shipping it separately means the blast radius
   is not tangled with four other changes if something needs backing out.
