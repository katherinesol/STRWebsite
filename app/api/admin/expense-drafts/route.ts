import { NextRequest, NextResponse } from 'next/server'
import { isAuthed, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()
  const { data } = await supabase.from('expense_drafts').select('*').order('created_at')
  return NextResponse.json({ drafts: data || [] })
}

// upsert a draft (create if no id, update if id present)
export async function POST(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const auth = await getAuth()
  const body = await request.json()
  const supabase = createAdminClient()
  const row = {
    vendor: body.vendor || null, amount: body.amount ?? null, hst_paid: body.hst_paid ?? null,
    date: body.date || null, category: body.category || null, description: body.description || null,
    property_id: body.property_id || null, notes: body.notes || null,
    line_items: body.line_items || null, receipt_path: body.receipt_path || null,
    updated_at: new Date().toISOString(),
  }
  if (body.id) {
    const { data, error } = await supabase.from('expense_drafts').update(row).eq('id', body.id).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data.id })
  }
  const { data, error } = await supabase.from('expense_drafts').insert({ ...row, created_by: auth.ok ? auth.userId : null }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function DELETE(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createAdminClient()
  await supabase.from('expense_drafts').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
