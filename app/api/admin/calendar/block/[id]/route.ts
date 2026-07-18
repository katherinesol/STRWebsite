import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed, getAuth } from '@/lib/auth'


export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json()
  const supabase = createAdminClient()

  // auto-flip is_booking when guest name is added
  if (body.guest_name && body.guest_name.trim()) {
    body.is_booking = true

    // find or create guest record
    const name = body.guest_name.trim()
    const { data: existing } = await supabase
      .from('guests')
      .select('id')
      .eq('name', name)
      .maybeSingle()

    if (existing) {
      body.guest_id = existing.id
    } else {
      const { data: newGuest } = await supabase
        .from('guests')
        .insert({ name, email: null, phone: null })
        .select('id')
        .single()
      if (newGuest) body.guest_id = newGuest.id
    }
  }

  const { error } = await supabase.from('calendar_blocks').update(body).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  // load the block to check its type + ownership
  const { data: block } = await supabase.from('calendar_blocks').select('reason, blocked_by').eq('id', id).maybeSingle()
  if (!block) return NextResponse.json({ error: 'Block not found' }, { status: 404 })

  // block permissions: owner removes any; co-owner only their own; others none
  if (block.reason === 'owner') {
    if (auth.role === 'owner') {
      // full control
    } else if (auth.role === 'co-owner') {
      if (block.blocked_by && block.blocked_by !== auth.userId) {
        return NextResponse.json({ error: 'You can only remove your own blocks' }, { status: 403 })
      }
    } else {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }
  }

  const { error } = await supabase.from('calendar_blocks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
