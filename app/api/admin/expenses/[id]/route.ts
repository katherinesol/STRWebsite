import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'
import { normaliseCategory } from '@/lib/expense-categories'

/* Editing and removing a filed expense.
 *
 *  Both are owner/co-owner and money:edit. DELETE used to be isAuthed(), which
 *  meant any signed-in account — a cleaner filing receipts included — could
 *  remove any expense in the ledger. Filing a receipt and destroying a
 *  financial record are not the same act and should not share a gate. The POST
 *  beside this stays looser for exactly that reason.
 *
 *  Category never arrives as free text: normaliseCategory maps it onto the CRA
 *  list or falls back, because that field is what the T2125 is grouped by. */

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0 }
const EDITABLE = ['date', 'vendor', 'description', 'amount', 'hst_paid', 'category', 'property_id', 'notes', 'reference'] as const

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('money', 'edit')) return NextResponse.json({ error: 'Not allowed to edit expenses' }, { status: 403 })

  const { id } = await params
  const raw = await request.json().catch(() => null)
  if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 })

  const rejected = Object.keys(raw).filter(k => !(EDITABLE as readonly string[]).includes(k))
  if (rejected.length) return NextResponse.json({ error: 'Unexpected fields', rejected }, { status: 400 })

  const patch: Record<string, any> = {}
  for (const k of EDITABLE) {
    if (!(k in raw)) continue
    if (k === 'amount' || k === 'hst_paid') patch[k] = n(raw[k])
    else if (k === 'category') patch[k] = normaliseCategory(raw[k]).category
    else patch[k] = raw[k] === '' ? null : raw[k]
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: before } = await supabase.from('expenses').select('*').eq('id', id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })

  const { data: after, error } = await supabase.from('expenses').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, before, after })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('money', 'edit')) return NextResponse.json({ error: 'Not allowed to delete expenses' }, { status: 403 })

  const { id } = await params
  const supabase = createAdminClient()
  const { data: before } = await supabase.from('expenses').select('*').eq('id', id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })

  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted: before })
}
