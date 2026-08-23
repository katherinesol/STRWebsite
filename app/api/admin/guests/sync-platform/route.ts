import { NextRequest, NextResponse } from 'next/server'
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

  if (email) {
    // upsert guest by email
    const { data: existing } = await supabase
      .from('guests')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      await supabase.from('guests').update({
        name,
        ...(phone && { phone }),
        returning_guest: true,
      }).eq('id', existing.id)
    } else {
      await supabase.from('guests').insert({
        name,
        email,
        ...(phone && { phone }),
        notes: `First seen via ${platform}`,
      })
    }
  } else {
    // no email — just create with name if not duplicate
    const { data: existing } = await supabase
      .from('guests')
      .select('id')
      .ilike('name', name)
      .maybeSingle()

    if (!existing) {
      await supabase.from('guests').insert({
        name,
        ...(phone && { phone }),
        email: `${name.toLowerCase().replace(/\s+/g, '.')}@platform.noemail`,
        notes: `Added from ${platform} — no email on file`,
      })
    }
  }

  // return the guest id so caller can link the calendar block
  const { data: g } = await supabase.from('guests').select('id').eq('email', email || `${name.toLowerCase().replace(/\s+/g, '.')}@platform.noemail`).maybeSingle()
  return NextResponse.json({ ok: true, guest_id: g?.id })
}
