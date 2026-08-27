import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'


export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('property', 'edit')) return NextResponse.json({ error: 'Not allowed to change property guides' }, { status: 403 })
  const { id } = await params
  const body = await request.json()
  const supabase = createAdminClient()
  const { error } = await supabase.from('property_guides').update({ ...body, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('property', 'edit')) return NextResponse.json({ error: 'Not allowed to delete property guides' }, { status: 403 })
  const { id } = await params
  const supabase = createAdminClient()
  const { error } = await supabase.from('property_guides').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
