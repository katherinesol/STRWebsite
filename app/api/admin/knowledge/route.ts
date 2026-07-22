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

// create a single knowledge entry (used by Add entry form + import save)
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { property_id, topic, title, content } = await request.json()
  if (!property_id || !title || !content) return NextResponse.json({ error: 'property_id, title, content required' }, { status: 400 })
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('knowledge_base').insert({
    property_id, topic: topic || 'general', title, content, active: true,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id })
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
