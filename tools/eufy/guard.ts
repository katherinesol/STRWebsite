/*  The one thing that stands between this probe and a locked-out tenant.
 *
 *  Extracted from the probe so it can be exercised against adversarial input
 *  without a lock, a network or an account. A guard nobody can test is a guard
 *  nobody has tested, and this one protects a person's home.
 *
 *  THE RULE: a write or delete may name exactly one value — the test code
 *  established in Q3 and proved absent from the lock there. Everything else is
 *  refused, and the refusals overlap on purpose. The tenant's code would have to
 *  get past all four to be touched; any one of them being right saves it. */

export class Refused extends Error {}

export type GuardState = {
  testCode: string           // '' until Q3 establishes it
  protectedCodes: Set<string>
  readSucceeded: boolean     // did Q3 actually read the lock?
  protectedOnDisk?: string[] // the independent second copy
}

export function assertSafeTarget(state: GuardState, code: unknown, what: string): string {
  /*  0. A target must be a primitive. An array or an object that happens to
   *     stringify to the right thing is a bug somewhere upstream, and a guard
   *     that quietly coerces it hides the bug instead of catching it. The
   *     dangerous version of this is a list of codes arriving where one was
   *     expected — refuse the shape, not just the value. */
  if (typeof code !== 'string' && typeof code !== 'number') {
    throw new Refused(`${what}: target is a ${Array.isArray(code) ? 'array' : typeof code}, not a single code. REFUSED.`)
  }
  const c = String(code).trim()

  //  1. Nothing may be targeted before a test code exists.
  if (!state.testCode) {
    throw new Refused(`${what}: no test code established. Refusing to touch anything.`)
  }
  //  2. Q3 must have actually read the lock. "We could not tell them apart"
  //     must never reach a delete — this is the tenant clause.
  if (!state.readSucceeded) {
    throw new Refused(`${what}: the lock's existing codes were never read, so the tenant's code cannot be told apart from the test code. REFUSED.`)
  }
  //  3. The target must BE the test code. Not "not protected" — the same value.
  //     An allowlist of one, rather than a denylist of everything else.
  if (c !== state.testCode) {
    throw new Refused(`${what}: target is not the test code. REFUSED.`)
  }
  //  4. And it must not appear among the codes read off the lock, in memory or
  //     on disk. If it does, the test code is somebody's real code and this
  //     script has no business with it.
  if (state.protectedCodes.has(c)) {
    throw new Refused(`${what}: that value is on the protected list read from the lock. REFUSED — it is somebody's code.`)
  }
  if (state.protectedOnDisk?.includes(c)) {
    throw new Refused(`${what}: that value appears in the protected file on disk. REFUSED.`)
  }
  return c
}

/** The test code must be absent from the lock, or it is not ours to use. */
export function chooseTestCode(candidates: string[], protectedCodes: Set<string>): string {
  const free = candidates.find(c => !protectedCodes.has(c))
  if (!free) throw new Refused('Every candidate test code is already on the lock. Refusing to reuse one.')
  return free
}
