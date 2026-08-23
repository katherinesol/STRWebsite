import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed, hasRole, hasPermission } from '@/lib/auth'
import { normaliseCategory } from '@/lib/expense-categories'

// Editing an invoice's line items and adjustments.
//
// Two modes on one endpoint so the preview and the commit can never disagree
// about the arithmetic — they read the same rows through the same code:
//
//   preview — read-only. Returns before/after and names every expense the
//             commit would re-categorise, so nothing about the write is a surprise.
//   commit  — one transaction via edit_invoice_full(). If that function is not
//             installed the request is REFUSED rather than falling back to a
//             sequence of independent writes: a half-applied edit leaves a total
//             that matches neither the old invoice nor the intended one.

const r2 = (v: number) => Math.round(v * 100) / 100
const n = (v: unknown) => (v == null ? 0 : Number(v) || 0)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Line = { id: string; description: string; amount: number; reason?: string }

function clean(rows: unknown, withReason = false): Line[] {
  if (!Array.isArray(rows)) return []
  return rows
    .filter((r: any) => r && UUID.test(String(r.id)) && String(r.description || '').trim())
    .map((r: any) => ({
      id: String(r.id),
      description: String(r.description).trim().slice(0, 500),
      amount: r2(n(r.amount)),
      ...(withReason ? { reason: String(r.reason || 'other').slice(0, 60) } : {}),
    }))
}

export async function POST(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await hasRole('co-owner')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await hasPermission('money', 'edit')) {
    return NextResponse.json({ error: 'Not allowed to edit invoices' }, { status: 403 })
  }

  const b = await request.json().catch(() => null)
  const invoice_id = String(b?.invoice_id || '')
  const preview = b?.commit !== true
  if (!UUID.test(invoice_id)) return NextResponse.json({ error: 'invoice_id required' }, { status: 400 })

  const items = clean(b?.items)
  const adjustments = clean(b?.adjustments, true)
  if (!items.length) return NextResponse.json({ error: 'An invoice needs at least one line item' }, { status: 400 })

  const dupe = (rows: Line[]) => new Set(rows.map(r => r.id)).size !== rows.length
  if (dupe(items) || dupe(adjustments)) {
    return NextResponse.json({ error: 'Duplicate row ids in payload' }, { status: 400 })
  }
  if (items.some(i => i.amount < 0) || adjustments.some(a => a.amount < 0)) {
    return NextResponse.json({ error: 'Amounts cannot be negative — use an adjustment to reduce a total' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: inv } = await supabase.from('invoices')
    .select('id, title, category, notes, hst_amount, contractor_name, company, property_id')
    .eq('id', invoice_id).maybeSingle()
  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  // Category must be one of the CRA-aligned set, or the expenses it syncs onto
  // fall out of the tax report. normaliseCategory is the same gate the receipt
  // extractor uses, so an invoice cannot introduce a category expenses can't hold.
  const rawCategory = b?.category != null ? String(b.category) : inv.category
  const { category, matched } = normaliseCategory(rawCategory)
  const hst_amount = b?.hst_amount != null ? r2(n(b.hst_amount)) : n(inv.hst_amount)
  const title = b?.title != null && String(b.title).trim() ? String(b.title).trim().slice(0, 200) : inv.title

  const [{ data: dbItems }, { data: dbAdj }, { data: dbPays }] = await Promise.all([
    supabase.from('invoice_items').select('id, description, amount').eq('invoice_id', invoice_id),
    supabase.from('invoice_adjustments').select('id, description, amount, reason').eq('invoice_id', invoice_id),
    supabase.from('invoice_payments').select('id, amount, status, paid_at, expense_id').eq('invoice_id', invoice_id),
  ])

  const sum = (rows: any[]) => r2((rows || []).reduce((s, x) => s + n(x.amount), 0))
  const beforeItems = sum(dbItems || []), beforeAdj = sum(dbAdj || [])
  const beforeTotal = r2(beforeItems - beforeAdj + n(inv.hst_amount))
  const afterItems = sum(items), afterAdj = sum(adjustments)
  const afterTotal = r2(afterItems - afterAdj + hst_amount)

  const paidRows = (dbPays || []).filter(p => p.status === 'paid')
  const paid = sum(paidRows)

  // The overpayment guard also lives in the SQL function, where it rolls the
  // transaction back. Checking here too means the UI can refuse before the round
  // trip and say the same thing the database would.
  const overpaid = afterTotal < paid - 0.005

  // Every expense this invoice's payments created. One invoice has many.
  const linkedIds = paidRows.map(p => p.expense_id).filter(Boolean) as string[]
  const { data: linked } = linkedIds.length
    ? await supabase.from('expenses').select('id, date, vendor, amount, category').in('id', linkedIds)
    : { data: [] as any[] }

  const categoryChanged = category !== inv.category
  const wouldSync = categoryChanged ? (linked || []).filter(e => e.category !== category) : []
  const unlinkedPaid = paidRows.filter(p => !p.expense_id)

  const diff = {
    items: {
      deleted: (dbItems || []).filter(r => !items.some(i => i.id === r.id)),
      inserted: items.filter(i => !(dbItems || []).some(r => r.id === i.id)),
      updated: items.filter(i => {
        const was = (dbItems || []).find(r => r.id === i.id)
        return was && (was.description !== i.description || r2(n(was.amount)) !== i.amount)
      }).map(i => ({ ...i, was: (dbItems || []).find(r => r.id === i.id) })),
    },
    adjustments: {
      deleted: (dbAdj || []).filter(r => !adjustments.some(a => a.id === r.id)),
      inserted: adjustments.filter(a => !(dbAdj || []).some(r => r.id === a.id)),
      updated: adjustments.filter(a => {
        const was = (dbAdj || []).find(r => r.id === a.id)
        return was && (was.description !== a.description || r2(n(was.amount)) !== a.amount)
      }).map(a => ({ ...a, was: (dbAdj || []).find(r => r.id === a.id) })),
    },
  }

  const body = {
    ok: true,
    invoice: { id: inv.id, title: inv.title, contractor: inv.contractor_name || inv.company },
    before: { items: beforeItems, adjustments: beforeAdj, hst: n(inv.hst_amount), total: beforeTotal, category: inv.category },
    after: { items: afterItems, adjustments: afterAdj, hst: hst_amount, total: afterTotal, category, title },
    paid,
    balance: r2(afterTotal - paid),
    overpaid,
    category_changed: categoryChanged,
    category_normalised: matched !== 'exact' ? { from: rawCategory, to: category, matched } : null,
    diff,
    // Named individually so the confirm step can list them rather than assert a count.
    expenses_to_sync: wouldSync.map(e => ({ id: e.id, date: e.date, amount: e.amount, from: e.category, to: category })),
    linked_expense_count: (linked || []).length,
    // Paid payments with no linked expense will NOT be re-categorised. Surfaced so a
    // silent partial sync can't happen the way the duplicate expenses did.
    unlinked_paid_payments: unlinkedPaid.map(p => ({ id: p.id, paid_at: p.paid_at, amount: p.amount })),
  }

  if (overpaid) {
    return NextResponse.json({
      ...body, ok: false,
      error: `Total would fall to $${afterTotal.toFixed(2)} but $${paid.toFixed(2)} is already paid. Reduce or remove a payment first.`,
    }, { status: preview ? 200 : 409 })
  }

  if (preview) return NextResponse.json(body)

  const { data: rpc, error } = await supabase.rpc('edit_invoice_full', {
    payload: { invoice_id, title, category, hst_amount, items, adjustments, notes: b?.notes ?? inv.notes },
  })

  if (error) {
    const missing = /function .*edit_invoice_full.* does not exist|PGRST202/i.test(error.message || '')
    return NextResponse.json({
      ok: false,
      error: missing
        ? 'edit_invoice_full is not installed. Run supabase/edit_invoice_full.sql — the edit was NOT applied. Nothing was changed.'
        : error.message,
      applied: false,
    }, { status: missing ? 501 : 500 })
  }

  return NextResponse.json({ ...body, applied: true, result: rpc })
}
