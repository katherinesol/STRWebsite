# The hub booking gate — scope

**Design only. Nothing here is built.**

## The finding that changes the shape of this work

**The server-side gate already exists, and it is sound.**
`POST /api/guest-support/verify` takes a confirmation code and a last name,
checks both booking tables, excludes cancelled bookings, enforces a stay window,
rate-limits by IP, and returns the booking. It has been in production since
August and the hub's Concierge card already calls it.

So this is not "build a gate". It is three narrower things:

1. Lift verification from **one card** to the **page**, so the whole hub knows
   which booking it is looking at.
2. Replace **localStorage holding the raw credentials** with a signed,
   httpOnly cookie.
3. Wire `lib/address-visibility.ts` — already built, already live on the portal
   — into the hub, which is what brings the 43 platform guests into scope.

Point 2 is a security fix that stands on its own merit and should not wait for
the rest.

---

## What is true today

| | |
|---|---|
| Platform bookings | **43**, every one with a confirmation code AND a guest name |
| Direct bookings | 4 (2 with `confirmation_code`, all 4 with `booking_reference`) |
| Statuses | all 43 `confirmed` — no cancelled rows to filter yet, but the filter stays |
| Hub today | property-keyed, no booking context, **does not receive the address** |
| Portal today | booking-keyed, direct only, "verified" by `?email=` in the query string |
| Verification | server-side, both tables, surname-only, 8 failed tries per IP per 15 min |
| Session today | `localStorage.zuhaus_guest = {code, lastName}` — **the credentials themselves** |

### Code entropy, measured

Airbnb `HM` + 8 alphanumeric ≈ 36⁸ ≈ 2.8 × 10¹². Houfy `HA-` + 6 ≈ 36⁶ ≈ 2.2 ×
10⁹. Guessing a *specific* guest's code is infeasible. Finding *any* valid code
is the relevant attack, and at 43 live bookings the space is still ~10¹⁰ per hit
on the Houfy shape. **The code is the secret; the surname is not.** Surnames are
on the public record, so the gate's strength is the code alone — which is why
the rate limit matters more than it looks.

---

## 1 · Server verification — extract, do not rewrite

`/api/guest-support/verify` already holds the logic. The move is to extract its
matching core into `lib/guest/verify-booking.ts` so two callers share one
implementation:

```
verifyBooking({ code, lastName }) -> { ok, booking } | { ok: false, reason }
   ├── ilike on confirmation_code (case-insensitive, exact value)
   ├── surnameOf(guest) === lastName.toLowerCase()   — surname only, never a forename
   ├── status <> 'cancelled'
   └── check_out >= today - 3 days
```

Both tables, `booking_kind` of `'direct'` or `'platform'`, the pattern already
used by `booking_guests` and `lock_actions`.

**What must NOT happen:** a `useState(verified)` that any other component can
set. The page reads the cookie **on the server**; an unverified request never
receives booking data at all, rather than receiving it and hiding it. Not-rendered
is not not-sent — the same lesson as the address leak, where a field no component
displayed was still in the payload.

## 2 · The session — a signed cookie, not localStorage

Today the guest's confirmation code and surname sit in `localStorage` in
plaintext, and are re-POSTed on every page load. Any XSS on the hub reads them;
they are the whole credential; and they are stored for as long as the browser
keeps them.

Proposed:

```
Cookie:  zuhaus_booking
Value:   base64url({ bid, kind, pid, exp }) + "." + HMAC-SHA256(payload, GUEST_SESSION_SECRET)
Flags:   httpOnly · Secure · SameSite=Lax · Path=/ · Max-Age per below
```

- **httpOnly** so script cannot read it — which is exactly what localStorage
  cannot offer.
- **Carries the booking id, not the credentials.** Stolen, it grants access to
  one booking until it expires; it does not hand over a reusable code.
- **Server-verified on every read.** The signature proves the cookie was issued
  by us; the page then re-reads the booking row, so a cancelled or altered
  booking stops working immediately rather than at expiry.
- **Lifetime: until checkout + 3 days, capped at 30 days.** Matching the
  verification window means a guest mid-stay is not asked again, and a cookie
  outliving the stay grants nothing the stay window would not.
- `GUEST_SESSION_SECRET` is a new env var. Absent, the gate **fails closed** —
  no cookie is issued and the hub stays public-only. It must never fall back to
  a default value.

## 3 · `?booking=` in the URL — prefill only, never a credential

A code in the URL leaks through referrer headers, browser history, server logs
and shared screenshots. So:

- `?booking=HM…` **prefills the code box. It never verifies on its own.**
- The surname is always typed, and always POSTed.
- After a successful POST the app replaces the URL with a clean one, so the code
  does not sit in history.

This keeps the convenience of a link in a check-in email without making the link
itself sufficient.

## 4 · What verification unlocks — reuse, do not re-implement

`lib/address-visibility.ts` is already built, already deployed on the portal, and
DST-proven. The hub calls the same functions:

```
addressState({ checkInDate, checkInTime, request, now })  ->  auto | approved | requested | withheld | hidden
showsAddress(state)          — only 'auto' and 'approved' release it
guestAddressCopy(state)      — never says "denied"
```

Unlocked on success: the exact address under the 24-hour rule, the request-early
button, the door code within its window, the House Guide for that property, and
the concierge with booking context. The concierge already gets this; the rest is
new to the hub.

**One hub-specific rule:** the hub is property-keyed, so a verified booking for
Royal York must not unlock Nickel Beach. The page compares the cookie's
`property_id` to the route's property and treats a mismatch as unverified.

## 5 · Unverified — the hub degrades to public

With no valid cookie the hub renders exactly what it renders today: the
description, area, amenities, house rules, FAQ, POIs, parking count, Houfy link.

**Nothing booking-specific is fetched, let alone hidden.** No address, no door
code, no guest name, no dates, no request button. The page does not know a
booking exists, so there is nothing in the payload to leak. The existing deploy
guard `tools/deploy/no-address-leak.py` already greps the rendered hub for the
street address and passes; it keeps running.

## 6 · Brute force — what today's limit does and does not cover

Today: 8 failed attempts per IP per 15 minutes, counted from `verify_attempts`.

Gaps worth closing while this is open:

- **Per-IP only.** Rotating IPs is unlimited. Add a **per-code** counter so a
  single code cannot be hammered from many addresses.
- **Failures are swallowed.** The insert is wrapped in `try {} catch {}`, so if
  logging breaks the limiter silently stops limiting. It should fail closed.
- **No lockout signal.** Katherine learns nothing when a code is being guessed.
  A row on Today when one booking sees more than N failures.

None of these block the gate. All three are small, and the first is the one that
matters.

---

## What this is NOT

- **Not a login.** No password, no account, no email round-trip. The code is the
  credential, which is the same trust model Airbnb and Houfy already use for the
  same guests.
- **Not a replacement for the portal.** The portal stays for direct bookings
  until the hub covers what it does. Its `?email=` verification is weaker than
  this gate — an email address is not a secret — and should be migrated onto
  this same path afterwards. **Logged, not bundled.**

## Order of work

1. Signed-cookie helper + `GUEST_SESSION_SECRET`, failing closed.
2. Extract `verifyBooking()`; `/api/guest-support/verify` keeps its behaviour.
3. `POST /api/guest/session` — verify, set cookie. `DELETE` — clear it.
4. Hub reads the cookie server-side; property mismatch is unverified.
5. Address visibility on the hub, reusing the portal's functions.
6. Per-code rate limit and the fail-closed logging fix.

Each step ships on its own. Step 1 alone fixes the localStorage exposure.
