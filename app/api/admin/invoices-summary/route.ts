import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed, hasRole } from '@/lib/auth'

// Invoice list for the rebrand's Money → Invoices screen.
// There is no total column: an invoice's total is its line items, less any
// adjustments held back, plus HST. What is owed is that minus payments.
const r2 = (v: number) => Math.round(v * 100) / 100
const n = (v: unknown) => (v == null ? 0 : Number(v) || 0)

export async function GET() {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await hasRole('co-owner')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const [{ data: invoices }, { data: items }, { data: adjustments }, { data: payments }] = await Promise.all([
    supabase.from('invoices').select('*'),
    supabase.from('invoice_items').select('invoice_id, amount'),
    supabase.from('invoice_adjustments').select('invoice_id, amount, description, reason'),
    supabase.from('invoice_payments').select('invoice_id, amount, paid_at, method, status, due_date'),
  ])

  const thisYear = new Date().getFullYear()
  const sumFor = (arr: { invoice_id: string; amount: unknown }[] | null, id: string) =>
    (arr || []).filter(x => x.invoice_id === id).reduce((s, x) => s + n(x.amount), 0)

  let paidThisYear = 0

  const rows = (invoices || []).map(i => {
    const lineItems = r2(sumFor(items, i.id))
    const heldBack = r2(sumFor(adjustments, i.id))
    const hst = n(i.hst_amount)
    const total = r2(lineItems - heldBack + hst)

    const mine = (payments || []).filter(p => p.invoice_id === i.id && p.status !== 'void')
    const paid = r2(mine.reduce((s, p) => s + n(p.amount), 0))
    for (const p of mine) {
      if (p.paid_at && new Date(p.paid_at).getFullYear() === thisYear) paidThisYear += n(p.amount)
    }
    const balance = r2(total - paid)
    const nextDue = mine.map(p => p.due_date).filter(Boolean).sort()[0]
      || (i.due_date ?? null)

    return {
      id: i.id, title: i.title, contractor: i.contractor_name, company: i.company,
      property: i.property_id, category: i.category,
      lineItems, heldBack, hst, total, paid, balance,
      owing: balance > 0.005,
      pct: total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0,
      lastPaidAt: mine.map(p => p.paid_at).filter(Boolean).sort().pop() || null,
      nextDue,
      paymentCount: mine.length,
      heldBackReason: (adjustments || []).find(a => a.invoice_id === i.id)?.description || null,
    }
  }).sort((a, b) => b.total - a.total)

  const owing = rows.filter(r => r.owing)
  const closed = rows.filter(r => !r.owing)
  // "biggest job" means contractor work — the property tax bill is not a job
  const biggestJob = rows.filter(r => r.contractor).sort((a, b) => b.total - a.total)[0] || null

  return NextResponse.json({
    rows, owing, closed,
    totals: {
      owing: r2(owing.reduce((s, r) => s + r.balance, 0)),
      owingCount: owing.length,
      closedCount: closed.length,
      paidThisYear: r2(paidThisYear),
      paidAll: r2(rows.reduce((s, r) => s + r.paid, 0)),
      contractors: new Set(rows.map(r => r.contractor).filter(Boolean)).size,
      biggestJob: biggestJob && { title: biggestJob.title, contractor: biggestJob.contractor, total: biggestJob.total, property: biggestJob.property },
      year: thisYear,
    },
  })
}
