/*  The guest session cookie — what replaced the credentials in localStorage.
 *
 *  WHAT WAS WRONG. The hub and /support stored the guest's confirmation code and
 *  surname in localStorage as plain text, and re-POSTed them on every page load
 *  to re-verify. That is the entire credential, sitting in a store any script on
 *  the page can read, kept until the browser is cleared. One reflected script on
 *  the hub and an attacker has a code that works from anywhere, for as long as
 *  the booking lasts — and the same code is what releases the door code.
 *
 *  WHAT THIS HOLDS INSTEAD: the booking it resolved to, never the code that
 *  resolved it. {bid, kind, pid, exp}, signed. Stolen, it grants ONE booking
 *  until it expires. It cannot be replayed against a different property, cannot
 *  be turned back into the confirmation code, and cannot be minted without the
 *  server secret.
 *
 *  httpOnly IS THE POINT. localStorage is readable by script by definition;
 *  there is no hardened way to keep a secret in it. A cookie the browser will
 *  not hand to JavaScript is the difference between "an XSS reads the
 *  credential" and "an XSS can ride the session while the page is open".
 *
 *  IT FAILS CLOSED. With no GUEST_SESSION_SECRET nothing is signed and nothing
 *  is trusted — no cookie is issued and no cookie is accepted. There is NO
 *  development default, because a default secret is a signing key published in
 *  the repository, and a gate anyone can forge a key for is worse than no gate:
 *  it stops people asking for the real one. The visible consequence is that a
 *  guest re-enters their code; the invisible consequence of the alternative is
 *  that anyone can mint a session.
 *
 *  THE SIGNATURE IS NOT THE AUTHORISATION. It proves we issued the cookie, and
 *  nothing else. Every reader re-reads the booking row, so a cancelled or
 *  altered booking stops working at once rather than at expiry. */

import { createHmac, timingSafeEqual } from 'crypto'

export const COOKIE = 'zuhaus_booking'
const MAX_DAYS = 30
const GRACE_DAYS = 3

export type GuestSession = {
  bid: string                       // booking id
  kind: 'direct' | 'platform'       // which table it lives in
  pid: string                       // property id — checked against the route
  exp: number                       // seconds since epoch
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url')
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8')

function secret(): string | null {
  const s = process.env.GUEST_SESSION_SECRET
  return s && s.trim().length >= 16 ? s.trim() : null
}

/** Absent or too short a secret means this whole mechanism is off, loudly. */
export function sessionsEnabled(): boolean {
  const ok = !!secret()
  if (!ok) console.error('[guest-session] GUEST_SESSION_SECRET is missing or too short — guest sessions are DISABLED. Guests will re-enter their code each visit.')
  return ok
}

const sign = (payload: string, key: string) =>
  createHmac('sha256', key).update(payload).digest('base64url')

/** How long the cookie may live: to checkout + 3 days, never past 30. */
export function expiryFor(checkOut: string | null | undefined, now = new Date()): number {
  const cap = Math.floor(now.getTime() / 1000) + MAX_DAYS * 86400
  if (!checkOut) return Math.min(cap, Math.floor(now.getTime() / 1000) + GRACE_DAYS * 86400)
  const out = new Date(checkOut + 'T23:59:59Z').getTime()
  if (Number.isNaN(out)) return Math.floor(now.getTime() / 1000) + GRACE_DAYS * 86400
  return Math.min(cap, Math.floor(out / 1000) + GRACE_DAYS * 86400)
}

export function issue(s: GuestSession): string | null {
  const key = secret()
  /*  Silence here would defeat the point. Failing closed is only safe if
   *  somebody can tell it is happening — otherwise "guests keep re-typing their
   *  code" looks like a UI bug for a month before anyone checks the env. */
  if (!key) { sessionsEnabled(); return null }
  const payload = b64(JSON.stringify(s))
  return `${payload}.${sign(payload, key)}`
}

/*  A wrong signature and an expired cookie both return null, and the caller
 *  cannot tell them apart — there is nothing useful to say to whoever sent a
 *  forged cookie. Compared in constant time so the answer cannot be found one
 *  byte at a time. */
export function read(raw: string | undefined | null, now = new Date()): GuestSession | null {
  const key = secret()
  if (!key || !raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot < 1) return null

  const payload = raw.slice(0, dot)
  const given = Buffer.from(raw.slice(dot + 1))
  const want = Buffer.from(sign(payload, key))
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null

  try {
    const s = JSON.parse(unb64(payload)) as GuestSession
    if (!s?.bid || !s?.pid || (s.kind !== 'direct' && s.kind !== 'platform')) return null
    if (!Number.isFinite(s.exp) || s.exp * 1000 <= now.getTime()) return null
    return s
  } catch {
    return null
  }
}

/** The flags matter as much as the signature. */
export function cookieOptions(exp: number) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.max(0, exp - Math.floor(Date.now() / 1000)),
  }
}
