# The portal's authentication — scope

**Design only. Nothing built.**

## The premise needs one correction, and it matters

**The portal's guest-facing login is not `?email=`.** `/portal/login` uses
Supabase magic-link OTP: a guest types their email, Supabase mails a one-time
link, and `/portal/[bookingId]` redirects to that login whenever
`supabase.auth.getSession()` comes back empty. That is **mailbox possession** —
genuinely strong, arguably stronger than the hub's code-plus-surname, because a
confirmation code travels in the very emails it protects.

**The hole is one layer down, and it is real.**

```ts
const email = searchParams.get('email')
if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

`/api/portal/booking/[bookingId]` checks that an email was *supplied*. It never
checks that the caller *holds* it. The browser authenticates properly and then
hands the API a string — and the API would have believed anyone. No session is
read, no token is validated, no header is required.

So the accurate statement is not "the portal authenticates by email". It is:

> **The portal's UI authenticates properly and its API does not authenticate at
> all.** Anyone who knows a booking id and a guest's email address can call the
> endpoint directly and receive the door code.

That is the thing to fix, and it is a smaller change than a migration.

## Why a wholesale move to the hub gate would strand guests

The portal's four bookings, as they actually stand:

| | email | confirmation code | can use |
|---|---|---|---|
| RS-1005 Mikaela Manley | yes | **none** | magic link only |
| RS-1006 Alain Roy | yes | **none** | magic link only |
| RS-1003 Per Polderman | **none** | yes | hub gate only |
| RS-1002 Jason Russell | placeholder | yes | hub gate only, in practice |

**Two of four cannot verify by code. One of four cannot receive a magic link.**
Removing either path locks somebody out of their own stay. The two missing codes
are the pre-fix `create_booking_full` bookings already queued for Kaye to
backfill; the missing email is not fixable by us at all.

## The proposal — authenticate the API, accept either proof

Three steps, each shipping alone.

### 1 · Make the endpoint verify (the actual fix)

The email in the query string stops being authorisation and becomes what it
always was — a lookup key, and not even a necessary one, since the route already
knows the booking id.

Accept **either** proof, both verified server-side:

- **A Supabase session.** The client sends `Authorization: Bearer <access_token>`;
  the route calls `supabase.auth.getUser(token)` and compares the verified email
  against the booking's guest. The magic link keeps working and is finally
  checked.
- **A hub session cookie.** `sessionMatches(bookingId)` — already built, already
  live on four other endpoints, bound to exactly one booking.

Neither, and it is 401 with nothing in the body.

### 2 · Same absence discipline as the hub

The door code and the address are **not fetched** until the caller is verified,
rather than fetched and omitted. The address half is already right here — the
route puts it in the response only when `showsAddress()` passes, and the comment
in it records why. The door code is not: `accessCode` is loaded whenever
check-in is within 48 hours, before anything has established who is asking.

Byte-checked on deploy, as the hub was: unverified call → door code and address
absent from the response, not null-valued.

### 3 · Then, and only then, retire `?email=`

Once both proofs work and the client sends one, the query parameter can go. Not
before — it is the only thing currently making the page work.

## What is preserved

- **The magic link.** It is the stronger of the two proofs and two guests depend
  on it. Replacing it with code-plus-surname would be a downgrade dressed as a
  migration.
- **The portal's booking-keyed shape.** It already knows the booking id; only
  the auth changes.
- **The address rule.** Same `lib/address-visibility` functions, unchanged.

## What breaks, honestly

- **Anything calling the API with `?email=` and no token breaks at step 3.**
  Nothing does except the portal page itself, which is updated in step 1. Checked:
  the only two callers are `app/portal/page.tsx` and
  `app/portal/[bookingId]/page.tsx`.
- **`/api/portal/bookings?email=` has the same hole** and the same fix. It lists
  a guest's bookings, so it leaks less, but it leaks the same way.

## What this is not

Not a merge of the portal into the hub. That is a bigger question — two guest
homes, one decision — and it is already logged in `guest-surface.md`. This scope
closes an authentication hole; it does not settle which page should exist.

## Order

1. `/api/portal/booking/[bookingId]` accepts a bearer token or a hub cookie;
   client sends the token. **Ships alone, fixes the hole.**
2. Door code fetched only after verification; byte-checked.
3. `/api/portal/bookings` gets the same treatment.
4. `?email=` removed once nothing sends it.
