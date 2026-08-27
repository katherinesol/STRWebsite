/*  What a caller may write, as opposed to whether they may call.
 *
 *  Phase 0 closed the first question on these endpoints and left the second one
 *  wide open, and the two are genuinely independent: a money:'edit' co-owner is
 *  now correctly allowed to call /admin/pricing, and could still send any column
 *  of property_pricing, because the handler spread the raw body into an upsert.
 *  Auth decides who; this decides what.
 *
 *  THE DAMAGE IS NOT HYPOTHETICAL ON THESE SIX. `{...body}` into
 *  property_settings lets a caller send property_id and move one property's
 *  settings onto another, because the WHERE clause pins the row but the SET
 *  clause can rewrite the key. `{...body}` into admin_settings lets a caller
 *  send id and break the `.eq('id', 1)` singleton every later read depends on.
 *  A raw insert into access_codes lets a caller set revoked_at and mint a code
 *  that is dead on arrival, or omit it and resurrect one.
 *
 *  IT REJECTS RATHER THAN STRIPS. Silently dropping an unexpected field makes a
 *  broken form look like a working one - the save returns ok and the value never
 *  lands, which is the shape of bug that takes a day to find. Naming the
 *  rejected keys turns it into an immediate 400. This follows the invoice PATCH
 *  and the figures endpoint, which both do exactly this. */

export type Picked<T = Record<string, any>> =
  | { ok: true; fields: T }
  | { ok: false; rejected: string[] }

export function pick(body: any, allowed: readonly string[]): Picked {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, rejected: ['(body must be a JSON object)'] }
  }
  const set = new Set(allowed)
  const rejected = Object.keys(body).filter(k => !set.has(k))
  if (rejected.length) return { ok: false, rejected }
  const fields: Record<string, any> = {}
  for (const k of allowed) if (k in body) fields[k] = body[k]
  return { ok: true, fields }
}

/** The 400 every caller of pick() returns, so the shape is identical everywhere. */
export function rejection(rejected: string[], allowed: readonly string[]) {
  return {
    error: 'Fields that cannot be set here',
    rejected,
    allowed: [...allowed],
    detail: 'Auth decides who may call this; this decides what they may write. '
      + 'A field is refused rather than ignored so a broken form fails loudly instead of saving nothing.',
  }
}
