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
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: pay } = await supabase.from('invoice_payments').select('*').eq('id', id).maybeSingle()
  if (!pay) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase.from('invoice_payments').update({ status: 'paid', paid_at: today, due_date: null }).eq('id', id)

  // create the expense (mirror of the invoice save flow)
  if (!pay.expense_created) {
    const { data: inv } = await supabase.from('invoices').select('contractor_name, company, property_id, title, hst_amount, category').eq('id', pay.invoice_id).single()
    const methodStr = pay.method ? `${pay.method}${pay.method_detail ? ' ' + pay.method_detail : ''}${pay.method_last4 ? ' …' + pay.method_last4 : ''}` : ''
    await supabase.from('expenses').insert({
      property_id: inv?.property_id || null,
      date: today,
      vendor: inv?.contractor_name || inv?.company,
      description: `Payment — ${inv?.title}${methodStr ? ' (' + methodStr + ')' : ''}`,
      amount: Number(pay.amount) || 0,
      category: inv?.category || 'Repairs & maintenance',
      hst_paid: inv?.hst_amount ?? null,
      notes: 'From invoice tracker',
      confirmed: true,
    })
    await supabase.from('invoice_payments').update({ expense_created: true }).eq('id', id)
  }
  return NextResponse.json({ ok: true })
}
