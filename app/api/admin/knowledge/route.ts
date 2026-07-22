import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('knowledge_base').select('*').order('property_id').order('topic')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: data || [] })
}

// update or delete an entry
export async function PATCH(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id, title, content, topic, active } = await request.json()
  const supabase = createAdminClient()
  const upd: any = { updated_at: new Date().toISOString() }
  if (title !== undefined) upd.title = title
  if (content !== undefined) upd.content = content
  if (topic !== undefined) upd.topic = topic
  if (active !== undefined) upd.active = active
  const { error } = await supabase.from('knowledge_base').update(upd).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id } = await request.json()
  const supabase = createAdminClient()
  const { error } = await supabase.from('knowledge_base').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
