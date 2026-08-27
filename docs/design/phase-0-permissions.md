# Phase 0 — the permission gates

**Scope only. Nothing changed.** Fix in risk order once approved.

## The finding that reframes it

It is not that two endpoints use `isAuthed()`. It is that **five of the six
permission categories are enforced nowhere in the codebase.**

| category | enforced? |
|---|---|
| `money` | **yes** — `hasPermission('money','edit')`, 12 call sites |
| `locks` | **no** — zero call sites |
| `guests` | **no** — zero |
| `damage` | **no** — zero |
| `property` | **no** — zero |
| `bookings` | **no** — zero |
| `calendar.addBlocks` / `deleteOwn` | **no** — `canAddBlocks()` and `canDeleteOwnBlocks()` exist in `lib/auth.ts` and are called from **zero files**. Dead code. |

Youlande's profile reads `locks:"none", money:"none", damage:"none",
guests:"none", property:"none", bookings:"view"`. Exactly one of those six does
anything. The rest are a settings screen that writes a value nothing reads —
worse than no setting at all, because it reports a restriction that is not in
force.

Note also that `money` is only ever checked at `'edit'`. No endpoint checks
`hasPermission(x,'view')`, so a `"view"` grant and a `"none"` grant are
currently indistinguishable everywhere except that `"edit"` unlocks writes.

## The template — already in the codebase, do not invent a new one

`app/api/admin/refunds/route.ts`:

```ts
if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
if (!await hasPermission('money', 'edit')) return NextResponse.json({ error: 'Not allowed to record refunds' }, { status: 403 })
```

Role first (who you are), permission second (what you may do), 403 for both, and
the permission message says what was refused. Every fix below applies exactly
this shape.

## Risk-ranked

`role` = the role gate to add. `perm` = the permission gate to add.
"Youlande" = whether she can reach it **today**.

### Tier 1 — door codes and access. She has `locks:"none"` and reaches all of these.

| endpoint | what it does | gate | Youlande today |
|---|---|---|---|
| `/admin/access/generate` | POST — **inserts rows straight into `access_codes` from the request body**, no allowlist | owner/co-owner + `locks,edit` | **reachable** |
| `/admin/access/[id]/revoke` | POST — revokes a guest's access code | owner/co-owner + `locks,edit` | **reachable** |
| `/admin/bookings/[id]/send-access-code` | POST — **emails a live door code to the guest** | owner/co-owner + `locks,edit` | **reachable** |
| `/admin/bookings/manual` | POST — creates a booking **and programs Seam locks** | owner/co-owner + `bookings,edit` | **reachable** |
| `/admin/locks/status`, `/admin/locks/sweep` | GET — full code state for every property | already owner/co-owner; add `locks,view` | **reachable** |

`/admin/locks/set-code`, `/discover`, `/list`, `/test-program` are already
`hasRole('owner')` — she cannot reach those, and they need no change.

### Tier 2 — money and pricing. She has `money:"none"`.

| endpoint | what it does | gate | Youlande today |
|---|---|---|---|
| `/admin/pricing` | PATCH/POST/DELETE — **upserts nightly rates from the raw body** | owner/co-owner + `money,edit` | **reachable** |
| `/admin/expenses/extract` | POST — LLM receipt extraction, storage read | owner/co-owner + `money,edit` | **reachable** |
| `/admin/expense-drafts` | GET/POST/DELETE — pending expense drafts | owner/co-owner + `money,edit` | **reachable** |
| `/admin/pending-receipts` | POST — files receipts into `expenses` | owner/co-owner + `money,edit` | **reachable** |
| `/admin/expenses/check-dup` | POST — reads expense history | owner/co-owner + `money,view` | **reachable** |
| `/admin/inventory` | GET — reads `expenses` line items | owner/co-owner + `money,view` | **reachable** |
| `/admin/settings` | PATCH — **`update({...body})`, no allowlist**, on `admin_settings` | owner-only | **reachable** |

`admin_settings` holds only `id, referral_reward_amount, updated_at`, so today's
blast radius is one number — plus `id`, which is writable and would break the
`.eq('id', 1)` singleton.

### Tier 3 — guests, property, damage. Categories that exist and are ignored.

| endpoint | what it does | gate | Youlande today |
|---|---|---|---|
| `/admin/bookings/[id]/send-portal-link` | POST — emails a portal link to a guest | owner/co-owner + `guests,edit` | **reachable** |
| `/admin/damage` | POST — `insert(body)` raw into `damage_reports` | owner/co-owner + `damage,edit` | **reachable** |
| `/admin/properties/[id]` | PATCH — `update({...body})` on `property_settings` | owner/co-owner + `property,edit` | **reachable** |
| `/admin/guides`, `/admin/guides/[id]` | POST/PATCH/DELETE — guest guide content | owner/co-owner + `property,edit` | **reachable** |
| `/admin/photos`, `/admin/photos/[id]` | POST/PATCH/DELETE + storage | owner/co-owner + `property,edit` | **reachable** |
| `/admin/reviews/[id]` | PATCH — edits a review | owner/co-owner + `property,edit` | **reachable** |
| `/admin/contacts` | POST/PATCH/DELETE | owner/co-owner + `property,edit` | **reachable** |
| `/admin/newsletter/send` | POST — **a stub**; returns "Email provider not yet connected" and sends nothing | owner-only | reachable, inert |
| plus the already-role-gated `guests`, `guests/[id]`, `guests/search`, `guests/sync-platform`, `guest-guide`, `bookings/guests` | add `guests,view`/`guests,edit` | | **reachable** |

### Tier 4 — operational. **Leave reachable.** These are why a blanket gate is wrong.

`tasks`, `tasks/[id]`, `tasks/complete`, `tasks/stay`, `supplies`,
`supplies/[id]`, `supplies/log`, `trips`, `trips/[id]`, `window-airing`,
`wind/stay`, `nickel-wind`, `cistern`, `cistern/usage`, `availability`.

A cleaner needs tasks, supplies and trips to do the job, and the existing
`hasRole('owner','co-owner','cleaner')` endpoints (`booking-media`, `parking`,
`stay-groups/all`) show the intended shape. Gating these to owner/co-owner would
break the cleaner workflow to close a hole that is not there. If they gain
anything it is `hasRole('owner','co-owner','cleaner')` — a role floor, not a
permission — and only to stop a signed-out or deactivated account reaching them.

## A separate defect, found while scoping

Six endpoints write **caller-supplied fields directly** with no allowlist:
`access/generate` (`insert(codes)`), `pricing` (`upsert({property_id, ...fields})`),
`properties/[id]` and `settings` (`update({...body})`), `damage` (`insert(body)`),
`contacts`. Auth decides *who* may call; an allowlist decides *what they may
set*. These are independent bugs and closing one does not close the other — the
invoice PATCH allowlist is the precedent.

## Verification plan — Youlande is the test

She is a real account with real restrictions, so the fix is provable rather than
argued. After each tier:

- **refused**: every Tier 1 endpoint (`locks:"none"`), every Tier 2 endpoint
  (`money:"none"`), Tier 3 guests/property/damage endpoints.
- **still allowed**: anything gated `bookings,view` — she has `"view"` — and
  every Tier 4 operational endpoint.
- **owner unaffected**: `hasPermission` returns true for `owner` and
  `is_superadmin` before consulting the map, so nothing changes for Katherine.
- Tested by calling `hasRole`/`hasPermission` with her real profile, not a
  fixture, and by confirming a `"view"` grant admits a `view` check and refuses
  an `edit` one.

## Order

1. **Tier 1** — door codes and access. The genuine hole.
2. **Tier 2** — money and pricing.
3. **Tier 3** — guests, property, damage.
4. **Tier 4** — role floor only, or leave alone.
5. Separately: the six missing allowlists.

Fixing Tier 1 alone converts `locks:"none"` from decorative into enforced, which
is the whole point of the setting.
