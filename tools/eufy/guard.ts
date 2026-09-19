/*  The one thing between this probe and a locked-out tenant.
 *
 *  THE BASIS OF PROTECTION CHANGED, AND THE REASON MATTERS.
 *
 *  The first version protected by CODE: read every code off the lock, refuse to
 *  touch any of them. On this hardware that is impossible — Eufy returns
 *  password:'' for every entry, so the codes cannot be read, and the version
 *  that tried ended up protecting short_user_id values while reporting that it
 *  had protected codes. A safety net that reports success while holding nothing
 *  is worse than no net.
 *
 *  So protection is by USERNAME, which works because of how the API is shaped:
 *  deleteUser(device, username, shortUserId) names a USER, not a code. The probe
 *  has exactly one user of its own, with an unmistakable name, and every write
 *  and delete names that user. The tenant's user is never named, by any code
 *  path, with any input — so their code survives without ever being read.
 *
 *  That is a STRUCTURAL guarantee rather than a comparison, and structural is
 *  stronger: a comparison can be fed the wrong value, but a name that appears
 *  nowhere in the program cannot be passed to anything.
 *
 *  Extracted so it can be exercised against adversarial input without a lock, a
 *  network or an account. A guard nobody can test is a guard nobody has tested.  */

export class Refused extends Error {}

/** The only user this probe may ever create, name, or delete. */
export const PROBE_USER = 'ZZ-PROBE-DELETE-ME'
/** A short id that cannot collide with the lock's own 0000/0001 sequence. */
export const PROBE_SHORT_ID = '9999'

export type GuardState = {
  /** Usernames and short ids read off the lock. Never targets. */
  protectedIdentities: Set<string>
  /** Did Q3 actually enumerate the lock's users? */
  readSucceeded: boolean
}

/*  Every write and delete goes through this. Five refusals, overlapping on
 *  purpose: the tenant's user would have to get past all five. */
export function assertSafeUser(state: GuardState, username: unknown, what: string): string {
  if (typeof username !== 'string') {
    throw new Refused(`${what}: target is a ${Array.isArray(username) ? 'array' : typeof username}, not a username. REFUSED.`)
  }
  const u = username.trim()

  if (!u) throw new Refused(`${what}: empty username. REFUSED.`)

  //  Q3 must have actually enumerated the users. "We could not see who is on
  //  this lock" must never reach a delete.
  if (!state.readSucceeded) {
    throw new Refused(`${what}: the lock's users were never enumerated, so the probe cannot know whose account it would touch. REFUSED.`)
  }
  //  An allowlist of exactly one name, compared exactly. Not "not protected".
  if (u !== PROBE_USER) {
    throw new Refused(`${what}: target is "${u}", not ${PROBE_USER}. REFUSED — the probe may only ever touch its own user.`)
  }
  //  And that name must not belong to somebody already on the lock.
  if (state.protectedIdentities.has(u) || state.protectedIdentities.has(u.toLowerCase())) {
    throw new Refused(`${what}: "${u}" is already a user on this lock. REFUSED — it is not the probe's to delete.`)
  }
  return u
}

/** The short id is a second axis; the same rule applies to it. */
export function assertSafeShortId(state: GuardState, shortId: unknown, what: string): string {
  if (typeof shortId !== 'string' && typeof shortId !== 'number') {
    throw new Refused(`${what}: short id is a ${typeof shortId}. REFUSED.`)
  }
  const s = String(shortId).trim()
  if (s !== PROBE_SHORT_ID) {
    throw new Refused(`${what}: short id "${s}" is not the probe's (${PROBE_SHORT_ID}). REFUSED.`)
  }
  if (state.protectedIdentities.has(s)) {
    throw new Refused(`${what}: short id "${s}" already belongs to a user on this lock. REFUSED.`)
  }
  return s
}

/** A passcode must be well-formed for Eufy: 4-8 digits. Checked before sending. */
export function assertWellFormedCode(code: unknown, what: string): string {
  if (typeof code !== 'string' && typeof code !== 'number') {
    throw new Refused(`${what}: passcode is a ${typeof code}. REFUSED.`)
  }
  const c = String(code).trim()
  if (!/^\d{4,8}$/.test(c)) {
    throw new Refused(`${what}: passcode must be 4-8 digits. REFUSED.`)
  }
  return c
}
