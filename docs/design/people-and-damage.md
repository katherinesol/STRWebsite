# Two scopes: unified people, and damage rebuilt

**Design only. Nothing built.** Both were settled in Katherine's keep-or-retire
pass on 21 September: contacts becomes part of `/keyholder/people`, damage is
rebuilt with photographs.

---

# 1 · CONTACTS → one people surface

## Why this is a build that also clears a page

`/admin/contacts` is the last separate address book. Folding it into
`/keyholder/people` retires it — the capability moves rather than disappearing,
which is the distinction the coverage audit kept getting wrong.

**The migration is free:** `contacts` holds **0 rows**. Nothing to move, no
mapping to agree, no risk of a bad import. This is the cheapest moment this will
ever be.

## The shape: one person, several roles

A person can be a guest, a contractor, or both — a cleaner who once stayed is one
human being, and two records of them is the duplicate problem the guest table
already has (two Molhems, ten wrongly-flagged returning guests).

```sql
alter table guests
  add column is_guest      boolean not null default true,
  add column is_contractor boolean not null default false;
```

**Two booleans, not one `contact_type` enum.** An enum forces `'both'` as a third
value that every filter then has to remember, and makes "show me everyone who
does any contracting" a string comparison. Two flags answer it directly and
cannot drift into an invalid combination — except `false, false`, which a check
constraint refuses.

`is_guest` defaults true so all 48 existing rows keep behaving exactly as they
do. Nothing changes on day one.

## Contractor fields — three certain, one for Katherine

| column | why |
|---|---|
| `trade` text | "Cleaner", "Plumber", "Snow removal" — the thing you search by when something breaks |
| `properties_served` text[] | which houses they cover; Nickel Beach is 90 minutes from Royal York and that matters at 7am |
| `contractor_notes` text | separate from guest `notes`, which a guest-facing surface may one day show |

**PENDING KATHERINE — the rate.** Three shapes, and they are not interchangeable:

- **a number** (`hourly_rate`) — simple, wrong for anyone who charges per job
- **free text** (`rate_note`) — "$45/hr, $90 callout after 6pm" — honest, unusable for arithmetic
- **nothing** — rates live on invoices, where the money already is

I would ask before choosing. `invoices` already carries `contractor_name` and
`contractor_contact`, so a rate on the person may duplicate what the invoice
records — and the invoice is the thing that gets paid.

## The UI

**One list, filtered.** `/keyholder/people?type=contractor` — the search box is
already server-side across name, email and phone, so it covers both populations
with no change.

**Guest-only things do not render for a contractor-only record.** Stay count,
loyalty milestones, `prior_stays`, lifetime value — all absent, not zeroed. A
contractor showing "0 stays" invites the question of why they have not stayed.

**A both-flagged person shows both sections.** That is the case the whole design
exists for.

## What this does NOT do

It does not touch `booking_guests`, the loyalty rule, or guest verification.
A contractor has no confirmation code and no stays; the hub gate cannot match
them and does not need to know they exist.

---

# 2 · DAMAGE → rebuilt, with evidence

## The current one has never worked

Not "unused" — **broken**. The API accepts `item`, `location`, `photo_urls`,
`amount_claimed` and `linked_to_deposit`; the table has **none of those
columns**. Postgres rejects an insert naming a column that does not exist, so
every submission has failed since the day it shipped. The 0 rows are not apathy,
they are the error. The list page then reads `r.amount_claimed` off rows that
could never exist.

Retiring the broken form is part of the rebuild, not a separate decision.

## TWO COMPETING DESIGNS ARE ALREADY IN THE DATABASE

Reading the schema rather than the form turns up a third piece nobody mentioned:

```
damage_items   id, property_id, name, room, notes          0 rows
damage_reports … item_id uuid  →  FK to damage_items       0 rows
booking_media  … report_id uuid (no FK), tag, booking_kind 0 rows
```

**`damage_reports.item_id` is a real foreign key to `damage_items`.** So the
schema was designed around a **per-property inventory** — "Sofa, Living room,
Nickel Beach" exists as a row, and a report points at it. That is why the table
has no `item` or `location` text columns: the item was supposed to carry both.

**The API and the form were written for free text instead** — `item`,
`location` — and that is the mismatch. It is not that someone forgot columns; two
designs were built and never reconciled, and the half that shipped was the half
with nowhere to write.

**This is the decision the rebuild turns on, and it is Katherine's:**

- **Inventory** — pick "Sofa" from a list of things in that house. Better
  reporting (what breaks most often, which room costs most), and the schema
  already supports it. Costs an inventory to populate first.
- **Free text** — type what broke. Nothing to set up, no cross-stay analysis.

I would ask rather than choose. The inventory is more work before the first
report and more use after the tenth, and only she knows whether there will be a
tenth. Note `/admin/inventory` is also a legacy page — worth checking whether
these are the same idea built twice.

## The reconciled schema

Whichever is chosen, the table and the API must agree. For the free-text shape:

```sql
alter table damage_reports
  add column item              text,          -- "Sofa", "TV remote"
  add column location          text,          -- "Living room"
  add column amount_claimed    numeric(10,2),
  add column linked_to_deposit boolean not null default false,
  add column booking_kind      text;          -- exists; must be constrained

-- booking_id is TEXT today while every other table uses uuid + kind.
-- It should match booking_guests and lock_actions: (booking_id, booking_kind).
```

`photo_urls` is deliberately **NOT** added — see below.

## Photographs: reuse `booking_media`, do not add a column

`booking_media` already stores guest-walkthrough photos against a booking, with
upload, deletion and a `canDeleteMedia` permission. A damage report is a second
kind of media on the same booking.

A `photo_urls text[]` on `damage_reports` would be a second, parallel photo
store — with its own upload path, its own orphaned-file problem, and no
relationship to the walkthrough images taken of the same room. **The before
picture is already in `booking_media`.** That is the whole value of a deposit
claim: this is how the room looked at check-in, this is how it looked after.

Proposed: `booking_media.kind` gains `'damage'`, and `damage_reports` references
the media rows rather than storing URLs.

**CHECKED — and it is better placed than expected.** `booking_media` already
carries `report_id uuid`, `tag text`, `booking_id` and `booking_kind`. The link
to a damage report was anticipated in the schema; only the foreign key is
missing, and there are no rows to conflict with adding it.

So the photo path is: upload through the existing `/api/admin/booking-media`
route, tag the row `'damage'`, set `report_id`. No new storage, no new upload
path, no parallel photo store.

One thing to know: `booking_media` has **0 rows**, so the walkthrough photo
feature has never been used either. The mechanism exists and is unproven — worth
one test upload before relying on it for a deposit claim.

## Where it lives

`/keyholder/stays/booking/[id]` — on the stay itself.

A damage report is *about a booking*: whose deposit, which stay, which room, and
the walkthrough photos are already there. A separate `/keyholder/damage` section
would be a list you visit after you already know something happened; the stay
page is where you are when you find out.

A roll-up list can follow if Katherine wants one. The report belongs on the stay.

## Kept separate from the money, deliberately

`damage_recovery` on the P&L is an income kind recorded through
`/api/admin/other-income`, reading `payments`. It **works** and is migrated.

A damage report is **evidence**; a recovery is **money received**. They are not
one-to-one — a claim may recover nothing, or partially, or via the platform's
resolution centre months later. Entangling them would mean either a report that
silently creates income that never arrived, or an income entry that cannot be
recorded without a report.

The most they should share is a link, and even that is optional. **Do not make
filing a report a bookkeeping act.**

## Open questions before building

1. **Inventory or free text?** The schema says inventory; the form says free
   text. This decides the whole build, and it is Katherine's call.
2. Is `/admin/inventory` the same idea as `damage_items`, built twice?
3. `damage_reports.booking_id` is `text` while the rest of the system uses
   `uuid` + `booking_kind`. Migrate it, or accept the inconsistency?
4. A damage roll-up list, or only the per-stay report?
5. `booking_media` has never been used. Worth one test upload before a deposit
   claim depends on it.
