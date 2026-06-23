import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed } from '@/lib/auth'


export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json()
  const supabase = createAdminClient()
  // clean empty strings for numeric fields
  const cleaned = { ...body }
  for (const key of ['locked_rate_royal_york', 'locked_rate_nickel_beach']) {
    if (cleaned[key] === '' || cleaned[key] === null) cleaned[key] = null
    else if (cleaned[key] !== undefined) cleaned[key] = parseFloat(cleaned[key])
  }
  if (cleaned.phone === '') cleaned.phone = null

  const { data: existingGuest } = await supabase.from('guests').select('name').eq('id', id).single()
  const { error } = await supabase.from('guests').update(cleaned).eq('id', id)
  if (error) { console.error('Guest PATCH error:', error.message); return NextResponse.json({ error: error.message }, { status: 500 }) }

  // cascade name change ONLY to blocks already linked by guest_id
  if (cleaned.name && cleaned.name !== existingGuest?.name) {
    await supabase.from('calendar_blocks')
      .update({ guest_name: cleaned.name })
      .eq('guest_id', id)
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()
  // nullify guest_id on bookings to preserve history
  await supabase.from('bookings').update({ guest_id: null }).eq('guest_id', id)
  const { error } = await supabase.from('guests').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
