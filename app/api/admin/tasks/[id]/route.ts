import { NextRequest, NextResponse } from 'next/server'
import { getTaskAccess } from '@/lib/task-access'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed } from '@/lib/auth'

// edit a task — owner only
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await getTaskAccess()
  if (!access.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.role !== 'owner') return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  const { id } = await params
  const body = await request.json()
  const allowed = ['title', 'description', 'property_id', 'type', 'cadence', 'priority', 'active']
  const updates: any = {}
  for (const k of allowed) if (k in body) updates[k] = body[k]
  const supabase = createAdminClient()
  const { error } = await supabase.from('maintenance_tasks').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// delete a task — owner only
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await getTaskAccess()
  if (!access.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (access.role !== 'owner') return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  const { id } = await params
  const supabase = createAdminClient()
  const { error } = await supabase.from('maintenance_tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
