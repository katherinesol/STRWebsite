import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// update an entry
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id } = await params
  const body = await request.json()
  const allowed = ['property_id', 'topic', 'title', 'content', 'active']
  const updates: any = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (k in body) updates[k] = body[k]
  const supabase = createAdminClient()
  const { error } = await supabase.from('knowledge_base').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// delete an entry
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id } = await params
  const supabase = createAdminClient()
  const { error } = await supabase.from('knowledge_base').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
