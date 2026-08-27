import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'
import { pick, rejection } from '@/lib/allowlist'


export async function POST(request: NextRequest) {
  /*  PROPERTY, not guests. The form's own placeholder reads "e.g. Cleaner,
      Supplier" - these are trades and vendors for running the properties, not
      the people who stay in them. */
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('property', 'edit')) return NextResponse.json({ error: 'Not allowed to change contacts' }, { status: 403 })
  const body = await request.json()
  if (!body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('contacts').insert({
    name: body.name.trim(),
    role: body.role || null,
    emails: (body.emails || []).map((e: string) => e.toLowerCase().trim()).filter(Boolean),
    phones: (body.phones || []).filter(Boolean),
    notes: body.notes || null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contact: data })
}

export async function PATCH(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('property', 'edit')) return NextResponse.json({ error: 'Not allowed to change contacts' }, { status: 403 })
  const body = await request.json()
  const { id, ...rest } = body || {}
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // the same five POST already allowlists; PATCH simply never did
  const ALLOWED = ['name', 'role', 'emails', 'phones', 'notes'] as const
  const p = pick(rest, ALLOWED)
  if (!p.ok) return NextResponse.json(rejection(p.rejected, ALLOWED), { status: 400 })
  const fields: Record<string, any> = { ...p.fields }
  if (fields.emails) fields.emails = fields.emails.map((e: string) => String(e).toLowerCase().trim()).filter(Boolean)

  const supabase = createAdminClient()
  const { error } = await supabase.from('contacts').update(fields).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('property', 'edit')) return NextResponse.json({ error: 'Not allowed to delete contacts' }, { status: 403 })
  const id = request.nextUrl.searchParams.get('id')
  const supabase = createAdminClient()
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
