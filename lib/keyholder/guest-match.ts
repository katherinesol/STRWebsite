/** One rule for "is this the same person", used by every path that could
 *  create a guest.
 *
 *  Four duplicate pairs exist today and all four have the same cause: one record
 *  carries a fabricated `name@platform.noemail` address, its twin carries none,
 *  and `eq('email')` cannot see through that. `eq` is also case-sensitive in
 *  Postgres, so Kris@x.com and kris@x.com mint two records.
 *
 *  TWO FUNCTIONS, DELIBERATELY DIFFERENT IN NERVE.
 *
 *  findGuest() runs when something is about to create a booking. It links only
 *  on evidence that identifies a person: a real email, a phone, or a full name
 *  that matches exactly once. It will not link "Molhem" to "Molhem Taskie",
 *  because the cost of being wrong is two strangers sharing a record — one
 *  person's phone number and stay history attached to another's booking.
 *
 *  findDuplicateCandidates() runs on the People page and is allowed to be
 *  suspicious. It surfaces exactly the pairs findGuest() refuses to merge, so a
 *  human decides. Nothing here merges anything; fusing two identity records has
 *  no clean undo. */

const SYNTHETIC = '@platform.noemail'

/** A fabricated platform address is a placeholder, not an identity. Matching on
 *  one is how "Mark" and "Mark Vallena" became two people. */
export function normaliseEmail(v: string | null | undefined): string | null {
  const e = String(v || '').trim().toLowerCase()
  if (!e || !e.includes('@')) return null
  if (e.endsWith(SYNTHETIC)) return null
  return e
}
export const isSyntheticEmail = (v: string | null | undefined) =>
  String(v || '').trim().toLowerCase().endsWith(SYNTHETIC)

/** Last ten digits, so +1 416 555 2915, (416) 555-2915 and 4165552915 agree. */
export function normalisePhone(v: string | null | undefined): string | null {
  const d = String(v || '').replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : null
}

/** Lowercased, accents folded, punctuation dropped, spaces collapsed — so
 *  "Samuel Séguin" and "samuel seguin" are one person. */
export function normaliseName(v: string | null | undefined): string | null {
  const n = String(v || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  return n || null
}
export const nameTokens = (v: string | null | undefined) => (normaliseName(v) || '').split(' ').filter(Boolean)

export type GuestRow = { id: string; name?: string | null; email?: string | null; phone?: string | null }
export type LinkMethod = 'email' | 'phone' | 'name'

/** How sure the link is, so a caller can act differently on a guess.
 *  email and phone are near-certain and link silently. A name-only link still
 *  happens — Airbnb withholds both address and number, so refusing it would
 *  leave every repeat platform guest permanently unlinkable — but it is a guess
 *  and says so. */
export type Match = { id: string; on: LinkMethod; certain: boolean } | null

/** Strict. Used before creating a guest. Returns a match only when the evidence
 *  identifies one person and one person only — an ambiguous name match returns
 *  nothing rather than picking the first row, which is how the wrong history
 *  gets stapled to a stranger. */
export function findGuest(candidates: GuestRow[], incoming: GuestRow): Match {
  const email = normaliseEmail(incoming.email)
  if (email) {
    const hit = candidates.filter(c => normaliseEmail(c.email) === email)
    if (hit.length === 1) return { id: hit[0].id, on: 'email', certain: true }
  }
  const phone = normalisePhone(incoming.phone)
  if (phone) {
    const hit = candidates.filter(c => normalisePhone(c.phone) === phone)
    if (hit.length === 1) return { id: hit[0].id, on: 'phone', certain: true }
  }
  const name = normaliseName(incoming.name)
  // A single-token name is not an identity. "Mark" matches too many Marks.
  if (name && nameTokens(name).length >= 2) {
    const hit = candidates.filter(c => normaliseName(c.name) === name)
    if (hit.length === 1) return { id: hit[0].id, on: 'name', certain: false }
  }
  return null
}

export type Candidate = {
  a: GuestRow; b: GuestRow
  reason: string
  confidence: 'high' | 'worth a look'
}

/** Loose, and only ever a suggestion. */
export function findDuplicateCandidates(guests: GuestRow[]): Candidate[] {
  const out: Candidate[] = []
  const seen = new Set<string>()
  const pair = (a: GuestRow, b: GuestRow, reason: string, confidence: Candidate['confidence']) => {
    const k = [a.id, b.id].sort().join('|')
    if (seen.has(k)) return
    seen.add(k); out.push({ a, b, reason, confidence })
  }

  for (let i = 0; i < guests.length; i++) {
    for (let j = i + 1; j < guests.length; j++) {
      const a = guests[i], b = guests[j]
      const an = normaliseName(a.name), bn = normaliseName(b.name)
      if (!an || !bn) continue

      const ap = normalisePhone(a.phone), bp = normalisePhone(b.phone)
      if (ap && ap === bp) { pair(a, b, 'same phone number', 'high'); continue }

      const ae = normaliseEmail(a.email), be = normaliseEmail(b.email)
      if (ae && ae === be) { pair(a, b, 'same email address', 'high'); continue }

      if (an === bn) {
        const synthetic = isSyntheticEmail(a.email) || isSyntheticEmail(b.email)
        pair(a, b, synthetic ? 'same name, one is a placeholder platform record' : 'same name', 'high')
        continue
      }

      /* One name is a prefix of the other — "Molhem" and "Molhem Taskie". This
         is the shape all four real duplicates take, and precisely what
         findGuest() refuses to act on by itself. */
      const at = nameTokens(an), bt = nameTokens(bn)
      const shorter = at.length <= bt.length ? at : bt
      const longer = at.length <= bt.length ? bt : at
      if (shorter.length >= 1 && shorter.every((t, k) => longer[k] === t) && shorter.length < longer.length) {
        pair(a, b, `"${shorter.join(' ')}" is the start of "${longer.join(' ')}"`, 'worth a look')
      }
    }
  }
  return out
}


/* ─────────────── reviewing the guesses ───────────────
 *
 *  There is nowhere to STORE how a link was made — no column on bookings,
 *  calendar_blocks or guests, and DDL is not available from the app. Rather than
 *  wait on a migration, the review set is derived, which has the side benefit of
 *  being true of links made before any of this existed.
 *
 *  The derivation: if a guest carries no real email and no phone, then a name is
 *  the only evidence anything could have matched them on. Every booking attached
 *  to such a guest was therefore a name-only link. If they have more than one,
 *  two stays have been fused on a name alone — which is exactly the case worth
 *  a human glance, and exactly what would go wrong if two different people
 *  happened to share one.
 *
 *  A guest WITH an email may also have been linked by name at some point, and
 *  that cannot be recovered after the fact. Those are the ones a stored column
 *  would catch and this cannot — worth the migration eventually, not worth
 *  blocking on. */

export type NameOnlyLink = {
  guest: GuestRow
  bookings: number
  why: string
}

export function nameOnlyLinks(
  guests: GuestRow[],
  bookingCountByGuestId: Record<string, number>,
): NameOnlyLink[] {
  return guests
    .filter(g => !normaliseEmail(g.email) && !normalisePhone(g.phone))
    .map(g => ({ guest: g, bookings: bookingCountByGuestId[g.id] || 0 }))
    .filter(x => x.bookings > 1)
    .map(x => ({
      ...x,
      why: `${x.bookings} stays share this record, and it has neither an email nor a phone — `
         + 'so every one of them was matched on the name alone.',
    }))
    .sort((a, b) => b.bookings - a.bookings)
}

/** Split a full name into first and last, the same way the 2026-08-24 backfill
 *  did. Used at guest creation so the columns are populated from the start —
 *  five different paths create guests and none of them used to set these, which
 *  would have left every new guest with no surname to verify against. */
export function splitName(full: string | null | undefined): { first_name: string | null; last_name: string | null } {
  const t = String(full || '').trim().split(/\s+/).filter(Boolean)
  if (!t.length) return { first_name: null, last_name: null }
  if (t.length === 1) return { first_name: t[0], last_name: null }
  return { first_name: t.slice(0, -1).join(' '), last_name: t[t.length - 1] }
}

/** The surname to verify a guest against, normalised for comparison.
 *
 *  Reads last_name when it is there and falls back to the last token of the
 *  full name when it is not. That is NOT the old any-token match — it is still
 *  strictly the surname, only sourced differently. The fallback exists because
 *  guests arrive from five creation paths, one of them a SQL function, and a
 *  guest whose last_name happens to be null must not be locked out of their own
 *  door code. */
export function surnameOf(g: { last_name?: string | null; name?: string | null } | null | undefined): string | null {
  const explicit = String(g?.last_name || '').trim()
  if (explicit) return explicit.toLowerCase()
  const derived = splitName(g?.name).last_name
  return derived ? derived.toLowerCase() : null
}
