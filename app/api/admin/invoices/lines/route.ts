import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// add an item, adjustment, or payment to an invoice
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { kind, invoice_id, description, amount, reason, method } = await request.json()
  if (!invoice_id || !kind) return NextResponse.json({ error: 'invoice_id and kind required' }, { status: 400 })
  const supabase = createAdminClient()

  if (kind === 'item') {
    const { error } = await supabase.from('invoice_items').insert({ invoice_id, description, amount: Number(amount) || 0 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (kind === 'adjustment') {
    const { error } = await supabase.from('invoice_adjustments').insert({ invoice_id, description, amount: Number(amount) || 0, reason: reason || 'other' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (kind === 'payment') {
    // payments start as 'planned' — become an expense only when marked paid
    const { error } = await supabase.from('invoice_payments').insert({ invoice_id, amount: Number(amount) || 0, method: method || null, status: 'planned' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    return NextResponse.json({ error: 'bad kind' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}

// mark a payment paid (with editable date) → creates an expense
export async function PATCH(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { payment_id, paid_at } = await request.json()
  if (!payment_id) return NextResponse.json({ error: 'payment_id required' }, { status: 400 })
  const supabase = createAdminClient()

  const { data: payment } = await supabase.from('invoice_payments').select('*').eq('id', payment_id).maybeSingle()
  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

  const paidDate = paid_at || new Date().toISOString().split('T')[0]

  // mark paid
  await supabase.from('invoice_payments').update({ status: 'paid', paid_at: paidDate }).eq('id', payment_id)

  // create the expense (once)
  if (!payment.expense_created) {
    const { data: invoice } = await supabase.from('invoices').select('contractor_name, property_id, title').eq('id', payment.invoice_id).maybeSingle()
    if (invoice) {
      await supabase.from('expenses').insert({
        property_id: invoice.property_id || null,
        date: paidDate,
        vendor: invoice.contractor_name,
        description: `Payment — ${invoice.title}`,
        amount: Number(payment.amount),
        category: 'Repairs & maintenance',
        notes: 'From invoice tracker',
        confirmed: true,
      })
      await supabase.from('invoice_payments').update({ expense_created: true }).eq('id', payment_id)
    }
  }
  return NextResponse.json({ ok: true })
}

// delete an item/adjustment/payment
export async function DELETE(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const kind = request.nextUrl.searchParams.get('kind')
  const id = request.nextUrl.searchParams.get('id')
  if (!kind || !id) return NextResponse.json({ error: 'kind and id required' }, { status: 400 })
  const table = kind === 'item' ? 'invoice_items' : kind === 'adjustment' ? 'invoice_adjustments' : 'invoice_payments'
  const supabase = createAdminClient()
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
