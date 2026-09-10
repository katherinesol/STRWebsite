# The guest-facing side

## THE OPERATING MODEL (settled — do not re-litigate)

**Booking, calendar, and payment are Houfy's. The site presents and redirects.
Site-side availability is a convenience, not a source of truth. Don't build
booking/payment/calendar-sync infrastructure the site doesn't need — Houfy owns
those.**

What follows from that, and why each is settled rather than pending:

- **No checkout, no payment, no deposit logic on the site.** The on-site checkout
  was deleted on 9 September 2026, not disabled. It confirmed card bookings
  without charging them and told e-transfer guests to pay a placeholder address.
  Houfy handles the money.
- **Site availability does not have to be load-bearing.** A guest who clicks
  through meets Houfy's real calendar at checkout, which is the backstop. Our
  calendar being briefly stale is a cosmetic problem, not a double-booking one.
- **Cross-platform sync is between Houfy and Airbnb**, their calendars talking to
  each other. The site is not inside that loop. The iCal export fix stays deployed
  because it is correct and costs nothing, but it is not on the critical path for
  taking bookings.
- **Houfy is not a fallback.** It takes 0% host commission and charges the guest
  no service fee — the 17% a Nickel Beach guest sees is tax. Against Airbnb's
  15.5% host fee it is the better deal for both sides.

**So the only job on the guest side: present the property beautifully and route to
Houfy.** That is the property pages and the guest hub. Anything else proposed for
this surface should be checked against that sentence first.

---

## Three surfaces, three audiences

| surface | audience | job |
|---|---|---|
| `/property/[id]` | prospective | the listing — photos, amenities, neighbourhood, book on Houfy |
| `/hub/[property]` | in-stay | arrival, house guide, recommendations, concierge |
| `/portal/[bookingId]` | booked | that booking's own details |

The "two guest homes, no decision" problem is `hub` vs `portal`. It does not touch
`/property/[id]`, which serves a genuinely different audience.

---

## OPEN — guest-hub access gate (server-verified, NOT client-side)

The Solhaus design gates the House Guide and concierge behind a confirmation
number plus last name. **That gate is deliberately unbuilt**, because the mockup's
version is `if (conf && last)` in the browser — decorative. Anyone can read the
source, call the API directly, or delete the condition in devtools.

When it is built:

- **Server-side**, checking confirmation + last name against actual bookings
  (`calendar_blocks.confirmation_code` / `bookings.booking_reference`, matched
  against the guest name on the row).
- Issue a short-lived signed cookie on success; the guide and concierge endpoints
  check it. The gate cannot live only in the page.
- The public guide route (`/api/guest/guide`) is public **on purpose** and stays
  that way for ungated properties; gating is per-surface, not per-route-namespace.

Do not ship the client-side version as a stopgap. A gate that looks like security
and is not is worse than no gate, because it stops anyone asking for the real one.

---

## Content gaps (need Katherine, not code)

- **House guides.** The `guest-guides` bucket holds exactly one file —
  `royal-york-east-guide.pdf`, for the property that is *not* accepting bookings.
  Nickel Beach and Royal York West, the two now sending guests to Houfy, have
  none, so their House Guide card opens to nothing. The existing PDF is 18.6 MB,
  which is heavy for a phone on hotel wifi.
- **Photos.** Nickel Beach has **one** photo at $880/night. Royal York West has 8.
  Royal York East has none.
- **`SUPPORT_EMAIL` / `SUPPORT_PHONE` are blank**, so the hub's "Reach us" section
  renders nothing at all. That is deliberate — a hub printing a placeholder phone
  number is worse than one printing none, because a guest will dial it — but it
  means the section is invisible until those are set.
