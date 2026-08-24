import { NextRequest, NextResponse } from 'next/server'
import { resolveGuest } from '@/lib/keyholder/guest-resolve'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole } from '@/lib/auth'


/* Guest records are the most personal table here — names, email addresses,
 * phone numbers and free-text notes. Every route on it was isAuthed(), so any
 * signed-in account could pull the whole list. Same hole as the booking PATCH,
 * closed the same way. */
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { name, email, phone, platform } = await request.json()
  if (!name) return NextResponse.json({ ok: true })

  const supabase = createAdminClient()

  /* This route existed to "upsert a guest by email", and when there was no email
     it invented one — name@platform.noemail — then looked the guest back up by
     that invention. Five records still carry such an address and four of the
     duplicate pairs trace to it: the placeholder made a person look like two.

     It is a thin wrapper now. resolveGuest treats a fabricated address as no
     address, matches on real evidence only, and writes nothing it had to make up. */
  const r = await resolveGuest(supabase, { name, email, phone })
  if (!r) return NextResponse.json({ ok: true })

  if (r.created && platform) {
    await supabase.from('guests').update({ notes: `First seen via ${platform}` }).eq('id', r.guestId)
  }

  return NextResponse.json({ ok: true, guest_id: r.guestId, linked_on: r.on, certain: r.certain })
}
