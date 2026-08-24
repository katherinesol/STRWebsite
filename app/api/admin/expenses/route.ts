import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed, hasRole } from '@/lib/auth'
import { normaliseCategory } from '@/lib/expense-categories'


/** Everything the expenses screen needs, in one request.
 *
 *  Gated with hasRole('co-owner') to match the rest of the Money section —
 *  mat-return and invoices-summary both use it, and an owner passes any role
 *  check. The POST below is deliberately looser (isAuthed) because cleaners
 *  file receipts; reading the whole expense ledger is not the same act.
 *
 *  Receipt URLs are signed here rather than in the page so the bucket stays
 *  private; they last an hour, which is longer than anyone spends on this
 *  screen and shorter than a link worth leaking. */
export async function GET() {
  if (!await hasRole('co-owner')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()

  const { data: rows, error } = await supabase.from('expenses')
    .select('*').order('date', { ascending: false }).limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const expenses = await Promise.all((rows || []).map(async (e: any) => {
    if (!e.receipt_path) return { ...e, signed_receipt_url: null }
    const { data: signed } = await supabase.storage
      .from('property-management').createSignedUrl(e.receipt_path, 3600)
    return { ...e, signed_receipt_url: signed?.signedUrl || null }
  }))

  /* The pending queue travels with the page. It is fed by the inbound-email
     route, and ReceiptReviewQueue is the only UI that can approve or reject a
     row, so it has to live wherever expenses live. */
  const { data: pendingRaw } = await supabase.from('pending_receipts')
    .select('*').eq('status', 'pending').order('created_at', { ascending: false })
  const pending = await Promise.all((pendingRaw || []).map(async (p: any) => {
    if (!p.receipt_path) return { ...p, signed_receipt_url: null }
    const { data: sg } = await supabase.storage
      .from('property-management').createSignedUrl(p.receipt_path, 3600)
    return { ...p, signed_receipt_url: sg?.signedUrl || null }
  }))

  return NextResponse.json({
    expenses,
    vendors: [...new Set(expenses.map((e: any) => e.vendor).filter(Boolean))].sort(),
    pending,
    pendingCount: pending.length,
  })
}

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0 }

export async function POST(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const supabase = createAdminClient()

  // duplicate detection — skip if force flag set
  if (!body.force) {
    const amount = body.amount
    const date = body.date
    const vendor = body.vendor

    // exact: same vendor + amount + date
    if (vendor) {
      const { data: exact } = await supabase.from('expenses')
        .select('id, vendor, amount, date')
        .eq('vendor', vendor).eq('amount', amount).eq('date', date)
        .limit(1)
      if (exact?.length) {
        return NextResponse.json({
          duplicate: true,
          level: 'exact',
          message: `Identical expense exists: ${vendor} $${amount} on ${date}`,
        }, { status: 409 })
      }
    }

    // same amount + date, any vendor
    const { data: sameDay } = await supabase.from('expenses')
      .select('id, vendor, amount, date')
      .eq('amount', amount).eq('date', date)
      .limit(1)
    if (sameDay?.length) {
      return NextResponse.json({
        duplicate: true,
        level: 'likely',
        message: `Same amount ($${amount}) already logged on ${date} (${sameDay[0].vendor || 'no vendor'})`,
      }, { status: 409 })
    }

    // same vendor + amount within 3 days
    if (vendor) {
      const d = new Date(date)
      const before = new Date(d); before.setDate(d.getDate() - 3)
      const after = new Date(d); after.setDate(d.getDate() + 3)
      const { data: nearby } = await supabase.from('expenses')
        .select('id, vendor, amount, date')
        .eq('vendor', vendor).eq('amount', amount)
        .gte('date', before.toISOString().split('T')[0])
        .lte('date', after.toISOString().split('T')[0])
        .limit(1)
      if (nearby?.length) {
        return NextResponse.json({
          duplicate: true,
          level: 'possible',
          message: `${vendor} $${amount} logged ${nearby[0].date} — within 3 days of this entry`,
        }, { status: 409 })
      }
    }
  }

  delete body.force
  /* An expense is built from named fields, never from the request body.
     `insert(body)` used to put whatever arrived straight into the table, so any
     column was settable and any string could land in `category` — which is the
     one field the CRA return is grouped by. normaliseCategory maps near-misses
     ("Motor vehicle" → "Motor vehicle (not CCA)") and falls back rather than
     writing something that is not a real category. */
  const cat = normaliseCategory(body.category)
  const row = {
    date: body.date, vendor: body.vendor || null, description: body.description,
    amount: n(body.amount), hst_paid: n(body.hst_paid),
    category: cat.category,
    property_id: body.property_id || null, notes: body.notes || null,
    receipt_url: body.receipt_url || null, receipt_path: body.receipt_path || null,
    line_items: body.line_items ?? null,
    ai_extracted: body.ai_extracted === true, confirmed: body.confirmed === true,
  }
  if (!row.date || !row.description || !row.amount) {
    return NextResponse.json({ error: 'date, description and amount are required' }, { status: 400 })
  }
  const { data, error } = await supabase.from('expenses').insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ expense: data })
}
