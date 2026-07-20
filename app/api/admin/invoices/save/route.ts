import { NextRequest, NextResponse } from 'next/server'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// batch save: create/update an invoice with all its lines in one call
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()
  const body = await request.json()
  const { id, contractor_name, company, contractor_contact, property_id, title, notes, hst_amount, tax_mode, items = [], adjustments = [], payments = [] } = body

  if (!contractor_name || !title) return NextResponse.json({ error: 'Contractor and title required' }, { status: 400 })
  const supabase = createAdminClient()

  // 1. create or update the invoice header
  let invoiceId = id
  if (invoiceId) {
    await supabase.from('invoices').update({
      contractor_name, company: company || null, contractor_contact: contractor_contact || null,
      property_id: property_id || null, title, notes: notes || null,
      hst_amount: hst_amount ?? null, tax_mode: tax_mode || 'auto',
    }).eq('id', invoiceId)
  } else {
    const { data: created, error } = await supabase.from('invoices').insert({
      contractor_name, company: company || null, contractor_contact: contractor_contact || null,
      property_id: property_id || null, title, notes: notes || null,
      hst_amount: hst_amount ?? null, tax_mode: tax_mode || 'auto',
      created_by: auth.ok ? auth.userId : null,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    invoiceId = created.id
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
    const { data: dbPays } = await supabase.from('invoice_payments').select('id').eq('invoice_id', invoiceId)
    const delPays = (dbPays || []).filter(r => !keepPayIds.includes(r.id)).map(r => r.id)
    if (delPays.length) await supabase.from('invoice_payments').delete().in('id', delPays)
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

  // 3. payments — insert new ones. For paid payments, create an expense.
  const newPays = payments.filter((p: any) => !p.id && p.amount)
  for (const p of newPays) {
    const status = p.status === 'planned' ? 'planned' : 'paid'
    const paidDate = status === 'paid' ? (p.paid_at || new Date().toISOString().split('T')[0]) : null
    const { data: payRow } = await supabase.from('invoice_payments').insert({
      invoice_id: invoiceId, amount: Number(p.amount) || 0, method: p.method || null,
      method_detail: p.method_detail || null, method_last4: p.method_last4 || null,
      status, paid_at: paidDate,
    }).select('id').single()

    if (status === 'paid' && payRow) {
      const { data: inv } = await supabase.from('invoices').select('contractor_name, property_id, title, hst_amount').eq('id', invoiceId).single()
      const methodStr = p.method ? `${p.method}${p.method_detail ? ' ' + p.method_detail : ''}${p.method_last4 ? ' …' + p.method_last4 : ''}` : ''
      await supabase.from('expenses').insert({
        property_id: inv?.property_id || null,
        date: paidDate,
        vendor: inv?.contractor_name,
        description: `Payment — ${inv?.title}${methodStr ? ' (' + methodStr + ')' : ''}`,
        amount: Number(p.amount) || 0,
        category: 'Repairs & maintenance',
        hst_paid: inv?.hst_amount ?? null,
        notes: 'From invoice tracker',
        confirmed: true,
      })
      await supabase.from('invoice_payments').update({ expense_created: true }).eq('id', payRow.id)
    }
  }

  return NextResponse.json({ ok: true, id: invoiceId })
}
