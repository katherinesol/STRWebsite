import { NextRequest, NextResponse } from 'next/server'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// batch save: create/update an invoice with all its lines in one call
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()
  const body = await request.json()
  const { id, contractor_name, company, contractor_contact, property_id, title, notes, hst_amount, tax_mode, category, due_date, items = [], adjustments = [], payments = [] } = body

  if ((!contractor_name && !company) || !title) return NextResponse.json({ error: 'Contractor or company, and title required' }, { status: 400 })
  const supabase = createAdminClient()

  // 1. create or update the invoice header
  let invoiceId = id
  if (invoiceId) {
    await supabase.from('invoices').update({
      contractor_name, company: company || null, contractor_contact: contractor_contact || null,
      property_id: property_id || null, title, notes: notes || null,
      hst_amount: hst_amount ?? null, tax_mode: tax_mode || 'auto', category: category || 'Repairs & maintenance', due_date: due_date || 'completion',
    }).eq('id', invoiceId)
  } else {
    const { data: created, error } = await supabase.from('invoices').insert({
      contractor_name, company: company || null, contractor_contact: contractor_contact || null,
      property_id: property_id || null, title, notes: notes || null,
      hst_amount: hst_amount ?? null, tax_mode: tax_mode || 'auto', category: category || 'Repairs & maintenance', due_date: due_date || 'completion',
      created_by: auth.ok ? auth.userId : null,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    invoiceId = created.id
  }

  // Invoice header, read once — every expense minted below derives its fields from it.
  const { data: inv } = await supabase.from('invoices')
    .select('contractor_name, company, property_id, title, hst_amount, category').eq('id', invoiceId).single()

  // Mint the expense for a payment, exactly once, ever.
  //
  // Two payments can legitimately share vendor+amount+date (Nikola was paid the same
  // sum on separate occasions), so identity has to come from the payment row itself.
  // The guard is invoice_payments.expense_id, read from the DB — never from the client
  // payload, whose expense_created flag is lost whenever a payment is recreated.
  // That lost flag is what minted three duplicate Flooring expenses in July 2026.
  async function mintExpense(paymentId: string, amount: number, paidDate: string, p: any) {
    const { data: row } = await supabase.from('invoice_payments')
      .select('expense_id, expense_created').eq('id', paymentId).maybeSingle()
    // expense_id set -> already has one. expense_created set with no expense_id -> it had
    // one and the expense was deleted deliberately; don't resurrect it behind the user's back.
    if (!row || row.expense_id || row.expense_created) return

    const methodStr = p.method ? `${p.method}${p.method_detail ? ' ' + p.method_detail : ''}${p.method_last4 ? ' …' + p.method_last4 : ''}` : ''
    const { data: expense } = await supabase.from('expenses').insert({
      property_id: inv?.property_id || null, date: paidDate,
      vendor: inv?.contractor_name || inv?.company,
      description: `Payment — ${inv?.title}${methodStr ? ' (' + methodStr + ')' : ''}`,
      amount, category: inv?.category || 'Repairs & maintenance',
      hst_paid: inv?.hst_amount ?? null, notes: 'From invoice tracker', confirmed: true,
    }).select('id').single()
    if (!expense) return

    // Compare-and-swap: only keep this expense if we won the race to claim the payment.
    // Two concurrent saves (double-click, retry) otherwise each mint one.
    const { data: claimed } = await supabase.from('invoice_payments')
      .update({ expense_id: expense.id, expense_created: true })
      .eq('id', paymentId).is('expense_id', null).select('id')
    if (!claimed || claimed.length === 0) {
      await supabase.from('expenses').delete().eq('id', expense.id)
    }
  }

  // 2a. reconcile deletions — remove existing DB rows the user deleted (id no longer in payload)
  if (invoiceId) {
    const keepItemIds = items.filter((i: any) => i.id).map((i: any) => i.id)
    const keepAdjIds = adjustments.filter((a: any) => a.id).map((a: any) => a.id)
    const keepPayIds = payments.filter((p: any) => p.id).map((p: any) => p.id)

    // delete items not in keep list
    const { data: dbItems } = await supabase.from('invoice_items').select('id').eq('invoice_id', invoiceId)
    const delItems = (dbItems || []).filter(r => !keepItemIds.includes(r.id)).map(r => r.id)
    if (delItems.length) await supabase.from('invoice_items').delete().in('id', delItems)

    const { data: dbAdjs } = await supabase.from('invoice_adjustments').select('id').eq('invoice_id', invoiceId)
    const delAdjs = (dbAdjs || []).filter(r => !keepAdjIds.includes(r.id)).map(r => r.id)
    if (delAdjs.length) await supabase.from('invoice_adjustments').delete().in('id', delAdjs)

    // for payments: also clean up their expenses when deleted
    const { data: dbPays } = await supabase.from('invoice_payments').select('*').eq('invoice_id', invoiceId)
    const delPayRows = (dbPays || []).filter(r => !keepPayIds.includes(r.id))
    if (delPayRows.length) {
      for (const p of delPayRows) {
        // Delete by id via the link. The old attribute match (vendor+amount+date) could
        // hit a sibling payment's expense when two payments shared all three.
        if (p.expense_id) await supabase.from('expenses').delete().eq('id', p.expense_id)
      }
      await supabase.from('invoice_payments').delete().in('id', delPayRows.map(r => r.id))
    }
  }

  // 2. insert any NEW lines (those without an id). Existing ones already persisted.
  const newItems = items.filter((i: any) => !i.id && i.description)
  if (newItems.length) {
    await supabase.from('invoice_items').insert(newItems.map((i: any) => ({ invoice_id: invoiceId, description: i.description, amount: Number(i.amount) || 0 })))
  }
  const newAdjs = adjustments.filter((a: any) => !a.id && a.description)
  if (newAdjs.length) {
    await supabase.from('invoice_adjustments').insert(newAdjs.map((a: any) => ({ invoice_id: invoiceId, description: a.description, amount: Number(a.amount) || 0, reason: a.reason || 'other' })))
  }

  // 3a. update EXISTING payments (edited due_date, status, method, etc.)
  const today0 = new Date().toISOString().split('T')[0]
  const existingPays = payments.filter((p: any) => p.id && p.amount)
  for (const p of existingPays) {
    const st = p.status === 'planned' ? 'planned' : 'paid'
    const pd = st === 'paid' ? (p.paid_at || today0) : null
    await supabase.from('invoice_payments').update({
      amount: Number(p.amount) || 0,
      method: p.method || null, method_detail: p.method_detail || null, method_last4: p.method_last4 || null,
      status: st, paid_at: pd,
      due_date: st === 'planned' ? (p.due_date || 'completion') : null,
    }).eq('id', p.id)
    // if it flipped planned->paid and no expense yet, create the expense
    if (st === 'paid') await mintExpense(p.id, Number(p.amount) || 0, pd as string, p)
  }

  // 3. payments — insert new ones. For paid payments, create an expense.
  const newPays = payments.filter((p: any) => !p.id && p.amount)
  for (const p of newPays) {
    const status = p.status === 'planned' ? 'planned' : 'paid'
    const paidDate = status === 'paid' ? (p.paid_at || today0) : null
    const { data: payRow } = await supabase.from('invoice_payments').insert({
      invoice_id: invoiceId, amount: Number(p.amount) || 0, method: p.method || null,
      method_detail: p.method_detail || null, method_last4: p.method_last4 || null,
      status, paid_at: paidDate, due_date: status === 'planned' ? (p.due_date || 'completion') : null,
    }).select('id').single()

    if (status === 'paid' && payRow) await mintExpense(payRow.id, Number(p.amount) || 0, paidDate as string, p)
  }

  return NextResponse.json({ ok: true, id: invoiceId })
}
