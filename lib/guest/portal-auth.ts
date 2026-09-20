/*  Actually authenticating the portal's API.
 *
 *  WHAT WAS WRONG, precisely. The portal's BROWSER login is real — Supabase
 *  magic-link OTP, mailbox possession, and the page redirects to it whenever
 *  there is no session. The API then received the authenticated email as a
 *  QUERY STRING and checked only that one had been supplied:
 *
 *      const email = searchParams.get('email')
 *      if (!email) return 401
 *
 *  So the browser proved who it was and the server threw the proof away. Anyone
 *  who knew a booking id and a guest's email address — neither of which is a
 *  secret; the email is on every message that guest ever sent — could call the
 *  endpoint directly and be handed the door code.
 *
 *  THE EMAIL IS A LOOKUP KEY NOW, NOT AUTHORISATION, and this decides whether
 *  the caller may use it.
 *
 *  EITHER PROOF, BECAUSE THE GUESTS ARE SPLIT. Two of the four direct bookings
 *  have an email and no confirmation code; one has a code and no email at all.
 *  Insisting on one proof would lock somebody out of their own stay, so a
 *  verified Supabase session and a hub booking cookie are both accepted. They
 *  are different strengths of the same claim, and each is checked on the server:
 *  the token is validated against Supabase rather than decoded and trusted, and
 *  the cookie's signature is ours.
 *
 *  NEITHER MEANS 401 WITH AN EMPTY BODY. A different message for "no such
 *  booking" would let someone map which ids exist. */

import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sessionMatches } from '@/lib/guest/prove'

export type PortalAuth =
  | { ok: true; by: 'supabase'; email: string }
  | { ok: true; by: 'hub-session' }
  | { ok: false }

/** The bearer token the portal page now sends, if it sent one. */
function bearer(request: NextRequest): string | null {
  const h = request.headers.get('authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  return m ? m[1] : null
}

/*  Validated BY SUPABASE, not by us. A JWT can be read without being trusted;
 *  getUser() asks the issuer whether this token is live, which is the part that
 *  cannot be forged. */
async function verifiedEmail(token: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    console.error('[portal-auth] Supabase URL or anon key missing — token proof is unavailable')
    return null
  }
  try {
    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await client.auth.getUser(token)
    if (error || !data?.user?.email) return null
    return data.user.email.toLowerCase()
  } catch {
    return null
  }
}

/**
 * @param bookingId when given, a hub session is accepted only if it was issued
 *                  for THIS booking. Omitted on the list endpoint, where there
 *                  is no single booking to bind to.
 */
export async function portalAuth(request: NextRequest, bookingId?: string): Promise<PortalAuth> {
  const token = bearer(request)
  if (token) {
    const email = await verifiedEmail(token)
    if (email) return { ok: true, by: 'supabase', email }
  }
  if (bookingId && await sessionMatches(bookingId)) {
    return { ok: true, by: 'hub-session' }
  }
  return { ok: false }
}
