import { findGuest, normaliseEmail, normalisePhone, type LinkMethod } from './guest-match'

/** The single entry point every booking path uses to attach a guest.
 *
 *  Five paths used to answer "is this the same person" five different ways —
 *  eq(email) here, ilike(email) then ilike(name) there, and one that fabricated
 *  name@platform.noemail and matched on that. Four duplicate pairs came out of
 *  the gaps between them. There is one answer now, and it lives in guest-match.
 *
 *  It loads the guest list once and matches in memory rather than asking the
 *  database a question per field. That is the only way findGuest can insist on a
 *  match being UNIQUE — a SQL maybeSingle() silently takes the first of two rows,
 *  which is how the wrong history gets attached to a stranger.
 *
 *  It never fabricates an email. A placeholder address is not identity, and
 *  writing one is what made "Mark" and "Mark Vallena" two people. */

export type ResolveResult = {
  guestId: string
  created: boolean
  on: LinkMethod | 'new'
  certain: boolean
}

export async function resolveGuest(
  supabase: any,
  incoming: { name?: string | null; email?: string | null; phone?: string | null },
): Promise<ResolveResult | null> {
  const name = String(incoming.name || '').trim()
  const email = normaliseEmail(incoming.email)
  const phone = normalisePhone(incoming.phone)
  if (!name && !email && !phone) return null

  const { data: all } = await supabase.from('guests').select('id, name, email, phone')
  const match = findGuest(all || [], { id: '', name, email: incoming.email, phone: incoming.phone })

  if (match) {
    /* Fill in what we now know and the record was missing. Never overwrite:
       a stored address the owner typed beats one scraped off a screenshot. */
    const existing = (all || []).find((g: any) => g.id === match.id)
    const patch: Record<string, string> = {}
    if (email && !normaliseEmail(existing?.email)) patch.email = email
    if (phone && !normalisePhone(existing?.phone)) patch.phone = incoming.phone as string
    if (name && !String(existing?.name || '').trim()) patch.name = name
    if (Object.keys(patch).length) await supabase.from('guests').update(patch).eq('id', match.id)
    return { guestId: match.id, created: false, on: match.on, certain: match.certain }
  }

  const { data: made } = await supabase.from('guests')
    .insert({ name: name || null, email: email || null, phone: phone ? incoming.phone : null })
    .select('id').single()
  if (!made) return null
  return { guestId: made.id, created: true, on: 'new', certain: true }
}
