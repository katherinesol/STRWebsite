import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// list all planned payments across invoices, with invoice context
export async function GET() {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()

  const { data: payments, error } = await supabase
    .from('invoice_payments')
    .select('id, invoice_id, amount, method, method_detail, method_last4, due_date, status')
    .eq('status', 'planned')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!payments?.length) return NextResponse.json({ payments: [] })

  // join invoice context
  const invIds = Array.from(new Set(payments.map(p => p.invoice_id)))
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, contractor_name, company, title, property_id')
    .in('id', invIds)
  const invMap = new Map((invoices || []).map(i => [i.id, i]))

  const enriched = payments.map(p => {
    const inv: any = invMap.get(p.invoice_id) || {}
    return {
      ...p,
      vendor: inv.contractor_name || inv.company || 'Unknown',
      title: inv.title || '',
      property_id: inv.property_id || null,
    }
  })
  // sort: dated first (soonest), then "on completion"
  enriched.sort((a, b) => {
    const ad = a.due_date && a.due_date !== 'completion' ? a.due_date : '9999'
    const bd = b.due_date && b.due_date !== 'completion' ? b.due_date : '9999'
    return ad.localeCompare(bd)
  })
  return NextResponse.json({ payments: enriched })
}

// mark a planned payment paid (today) — creates the expense like the invoice flow does
export async function PATCH(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  /*  Marking a scheduled payment paid used to take an id and nothing else, so
      it recorded WHEN money moved but never from WHERE. That is how a $2,000
      billpay reached the ledger with no detail on it and the payments migration
      had to ask which account it left from. The method fields are optional here
      because a planned row may already carry them from the invoice panel — what
      is sent overrides, what is not sent leaves the existing value alone. */
  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const EDITABLE = new Set(['id', 'method', 'method_detail', 'method_last4', 'reference'])
  const rejected = Object.keys(body || {}).filter(k => !EDITABLE.has(k))
  if (rejected.length) {
    return NextResponse.json({ error: 'Marking paid sets the method only', rejected }, { status: 400 })
  }
  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: pay } = await supabase.from('invoice_payments').select('*').eq('id', id).maybeSingle()
  if (!pay) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const patch: Record<string, any> = { status: 'paid', paid_at: today, due_date: null }
  if (body.method) patch.method = body.method
  if ('method_detail' in body) patch.method_detail = body.method_detail || null
  if ('method_last4' in body) patch.method_last4 = body.method_last4 || null
  if ('reference' in body) patch.reference = body.reference || null
  await supabase.from('invoice_payments').update(patch).eq('id', id)

  // re-read, so the expense description below names what was actually stored
  const { data: fresh } = await supabase.from('invoice_payments').select('*').eq('id', id).maybeSingle()
  const rec = fresh || pay

  // create the expense (mirror of the invoice save flow)
  if (!pay.expense_created) {
    const { data: inv } = await supabase.from('invoices').select('contractor_name, company, property_id, title, hst_amount, category').eq('id', pay.invoice_id).single()
    const methodStr = rec.method ? `${rec.method}${rec.method_detail ? ' ' + String(rec.method_detail).trim() : ''}${rec.method_last4 ? ' …' + rec.method_last4 : ''}` : ''
    /*  RECORD WHICH EXPENSE, not merely that there was one.
     *
     *  This set expense_created and stopped there, so the payment knew an expense
     *  existed but not which one. Deleting the payment then could not clean it up
     *  — there was no id to target — and the expense orphaned. It is also why one
     *  row carried expense_created true with a null expense_id, the row that made
     *  the flag underivable during the payments backfill. Three payments are in
     *  that state today.
     *
     *  The compare-and-swap is the same guard the invoice save flow uses: claim
     *  the payment only if nothing else has, and bin the expense if we lost the
     *  race. Two concurrent marks — a double click, a retry — would otherwise each
     *  mint one and leave a duplicate in the books. */
    const { data: expense } = await supabase.from('expenses').insert({
      property_id: inv?.property_id || null,
      date: today,
      vendor: inv?.contractor_name || inv?.company,
      description: `Payment — ${inv?.title}${methodStr ? ' (' + methodStr + ')' : ''}`,
      amount: Number(rec.amount) || 0,
      category: inv?.category || 'Repairs & maintenance',
      hst_paid: inv?.hst_amount ?? null,
      notes: 'From invoice tracker',
      reference: rec.reference || null,
      confirmed: true,
    }).select('id').single()

    if (expense) {
      const { data: claimed } = await supabase.from('invoice_payments')
        .update({ expense_id: expense.id, expense_created: true })
        .eq('id', id).is('expense_id', null).select('id')
      if (!claimed || claimed.length === 0) {
        await supabase.from('expenses').delete().eq('id', expense.id)
      }
    }
  }
  return NextResponse.json({ ok: true })
}
