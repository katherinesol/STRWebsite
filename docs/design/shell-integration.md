# Bringing the orphaned screens into the new shell

Scope only — nothing here is built. Written 2026-08-26 from the coverage check of
`components/admin/AdminNav.tsx` against `components/admin/KeyholderNav.tsx`.

**The standard is the Money and People rebuild, not a restyle.** Those screens did
not merely change colour: Expenses gained a category column that doubles as the
filter, Income became read-only on purpose because the route behind inline editing
skipped the tax engine, and the People page reshaped around who has actually
stayed. "Integrated" here means the screen gets better, or it is not done.

## What makes this bigger than it looks

**Two of the six tabs are nearly empty.** `/keyholder/property` is a 12-line
placeholder reading "Still on the legacy admin", and `/keyholder/stays` is a
20-line signpost with one link. Several screens below belong in those tabs, so
rehoming them means **building the tab out first**, not dropping a card into an
existing page.

**The legacy booking pages cannot retire yet.** Six components mount only there —
`BookingActions`, `GuestEditCard`, `WindLogCard`, `WaterUsageCard`,
`BookingSupportCard`, `PaymentReminderForm` — and so do the four held tax files.
Phase 3 below overlaps that work; it cannot complete until the VRBO/Airbnb audit
unholds them.

## Gating problems to fix on the way past

Found while scanning, not previously logged. These are not restyle notes.

- **`/api/admin/newsletter/send` is `isAuthed()` only.** Any signed-in account,
  including a cleaner, can send to the whole list. **Fix before this screen is
  rehomed anywhere.**
- **`/api/admin/settings` is `isAuthed()` only** — a cleaner can read and write
  system settings.
- `tasks`, `contacts`, `inventory`, `damage`, `supplies`, `trips`,
  `properties/[id]` are all `isAuthed()`. Defensible for operational screens a
  cleaner uses (tasks, supplies), questionable for the rest.
- Correctly gated already: `inbox` and `knowledge` (owner/co-owner), `users` and
  `staff-access` (owner).

---

## Where each screen belongs

### → Assistant

The nav's own comment says Assistant was meant to be "the home for the AI/comms
cluster — Haussy, Inbox, Knowledge, Concierge". Two of those four never arrived.

| screen | now | data | redesigned means |
|---|---|---|---|
| **Inbox** | `/admin/inbox` + `[id]`, `draft`, `send`, `sync` | owner/co-owner ✓ | Real rebuild. Threading, the draft/send loop, and sync status surfaced rather than hidden. Should sit beside Haussy so a draft can become a reply. |
| **Concierge Knowledge** | `/admin/knowledge` + `import` | owner/co-owner ✓ | Quick-to-medium. Belongs with Concierge under Property *or* Assistant — **decide, because Concierge already lives under Property** per design-doc 6b. Splitting knowledge from the concierge it feeds would be a mistake. |

### → Property (tab must be built first)

| screen | now | data | redesigned means |
|---|---|---|---|
| **Properties** | `/admin/properties`, `[id]`, `/photos`, `/pricing` | `isAuthed()` | The Property tab's Overview. This is the natural landing page and it is currently a placeholder. Per-property: locks, feeds, pricing, photos, cleaning duration. **The per-property standard check-in/checkout times belong here** — they are declared nowhere and are currently implicit in `windowFromBooking`. |
| **Prop mgmt** (supplies, trips) | `/admin/property-management/*` | `isAuthed()` | Medium. Supplies and trips are operational; they want to be per-property, not a separate silo. |
| **Access** | `/admin/access` | — | **RETIRED — confirmed intentional drop, 2026-08-26.** Staff Access in the new dropdown replaces it. Do not rebuild. Remove the link when the legacy nav goes. |
| **Inventory / Supplies** | see the investigation below | `isAuthed()` | **Phase 2 scoping item.** Investigated 2026-08-26; recommendation below awaiting a decision. Nothing built. |

### → Stays (tab must be built out)

| screen | now | data | redesigned means |
|---|---|---|---|
| **Bookings list** | `/admin/bookings` | — | Real rebuild. Booking *detail* was rebuilt (`BookingDetail`); the *list* was not, so Stays has no index of bookings. This is the largest single gap in the new shell. |
| **Tasks** | `/admin/tasks`, `complete`, `stay` | `isAuthed()` | Real rebuild, **high use**. Already has overdue logic (`dueStatus.state`). Should tie to the stay it belongs to — the `tasks/stay` endpoint already exists. |
| **Parking** | `/admin/parking` | mixed roles | Own scoping pass, already logged. Relates to `vehicle_count` / `plate_numbers` / `plates_pending`. |
| **Damage** | `/admin/damage`, `/new` | `isAuthed()` | Medium. Ties to a booking and to `securityDeposit`. **Guest-side damage reporting does not exist** — the portal has no report path, so this is only ever host-entered today. |

### → People

| screen | now | data | redesigned means |
|---|---|---|---|
| **Contacts** | `/admin/contacts` | `isAuthed()` | **KEEP — a real build, decided 2026-08-26.** Non-guest people (cleaners, contractors, vendors) linked to their **payment and invoice history**, so a vendor's contact card surfaces what has been paid to them. **Ties directly to the payment-reconciliation build** — a vendor is the join between a contact and its expenses/invoices, and neither side is much use without the other. Sequence it with that work, not before it. |
| **Reviews** | `/admin/reviews` + `[id]` | page only | **KEEP — a feature build, decided 2026-08-26.** Unified reviews: Airbnb/VRBO import plus direct submissions. Not a rehome; the import does not exist. |

### → Money

| screen | now | data | redesigned means |
|---|---|---|---|
| **MAT — Port Colborne / Toronto** | `/admin/mat`, `/admin/toronto-mat` | owner | **Verify overlap first.** `/keyholder/money/tax` is the MAT *return*; these two are the older report screens and do **not** redirect. Establish whether the Tax tab already replaces them before rebuilding anything. |

### → A new home (as Access was)

| screen | now | data | redesigned means |
|---|---|---|---|
| **Settings** | `/admin/settings` | `isAuthed()` ⚠ | Belongs in an account/admin menu under the avatar, not a top tab. Fix the gate. |
| **Team & Access** | `/admin/users` | owner ✓ | Same menu. |
| **Security** | `/admin/security` | — | Same menu. 2FA/passkey routes exist. |
| **Newsletter** | `/admin/newsletter`, `send` | `isAuthed()` ⚠ | Same menu, **after the gate is fixed**. Note there is no public signup, so the list only holds what the admin side already has. |

---

## Phased order

Most-used and most-broken first. Each phase is separately approvable and
separately deployable.

**Phase 0 — the gate fixes.** `newsletter/send` and `settings` off `isAuthed()`.
Hours, not days, and independent of every rehome below. Should not wait behind a
redesign.

**Phase 1 — Stays, made real.** Bookings list + Tasks. The two highest-use
operational screens, and Stays is currently a signpost. Delivers the most daily
value and makes the tab worth opening.

**Phase 2 — Property, made real.** Properties overview, then Prop mgmt. Unblocks
the per-property configuration several other items need — cleaning duration for
turnover conflict detection, and the standard check-in/checkout times that UI
issue 3 depends on.

**Phase 3 — Assistant completed.** Inbox, then Knowledge (after deciding
Knowledge's home). Overlaps `BookingSupportCard` in the retirement set.

**Phase 4 — the account menu.** Settings, Team & Access, Security, Newsletter
rehomed under the avatar. Mostly rehome, little redesign.

**Phase 5 — Damage and Parking.** Both want a real think; Damage may also want
the guest-side report the portal lacks.

**Phase 6 — the two feature builds.** Contacts-with-payment-history (sequenced
with payment reconciliation, which it depends on) and unified Reviews with
platform import. Both are builds, neither is a rehome.

**Retired, not rebuilt:** Access — superseded by Staff Access.

---

## Investigation: Inventory vs Supplies (Phase 2 scoping, nothing built)

Asked for: a way to record **one-time durable purchases** — a sink, a tap, an
appliance — so the same one can be rebought when it breaks, kept apart from
restocking consumables.

### What each actually is today

**`supplies` — a consumables restock model, barely used.** A real table:
`property_id, name, category, quantity_on_hand, reorder_point, unit,
supplier_notes, last_restocked_at, item_photo_url, active`. Every column is about
*running out and topping up*. **It holds 3 rows**, all "Cleaning supplies", one
of them named "testig", all with `quantity_on_hand = 0`. The shape is right for
consumables; it has simply never been adopted.

**`/admin/inventory` — there is no inventory table.** It is a **derived view over
expense line items**: expenses whose `category` is in `INVENTORY_CATEGORIES`
(Repairs & maintenance, Supplies, Office expenses, Office stationery, CCA) and
whose `line_items` is not null, flattened into name / amount / qty / vendor /
date / property / **receipt_path**. Its own subtitle is *"What you own, pulled
from receipts — with what it cost and where to rebuy it."*

**That is already the durables register being asked for** — in embryo, and
starved. **Only 3 of 57 expenses have `line_items` at all**, and just 2 of those
fall in a qualifying category. The idea is sound; the data is not there.

### Recommendation: two things, not one — but do not start from scratch

**Keep `supplies` as consumables.** Right shape, wrong adoption. A flag on it
would be wrong: a consumable's questions are *how many left, when to reorder*; a
durable's are *which exact model, bought when, from whom, for how much, still
under warranty, installed where*. One table answering both answers neither well,
and the reorder columns would sit permanently null on every fixture.

**Add a `fixtures` register, but reference the expense rather than copy it.** The
purchase record already exists in `expenses` with its receipt. Duplicating price
and vendor into a second table creates two truths that will drift. A fixture
should hold what an expense line cannot: **where it is installed, model and
serial, warranty expiry, date replaced, and current status** — with a foreign key
to the originating expense (and its line item) for cost, vendor and receipt.

That gives the two links wanted, honestly: **Expenses** supplies the original
receipt, and **Damage** can point at the fixture that broke, which then points at
what to rebuy.

**The real blocker is line-item capture, and it is worth solving first.** With
3/57 expenses carrying line items, any register built on them starts empty. Two
ways, not exclusive: improve extraction so receipts yield line items reliably, or
let a fixture be entered directly with the expense link optional, so the register
is usable before extraction catches up. **I would do the second first** — it
makes the feature useful immediately and does not block on an extraction
improvement that has its own uncertainty.

**Decision needed:** two things as above, or one combined. Nothing is built
either way.
