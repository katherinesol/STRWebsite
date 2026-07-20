import { NextRequest, NextResponse } from 'next/server'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// list invoices with computed totals (owner + co-owner)
export async function GET() {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()
  const { data: invoices } = await supabase.from('invoices').select('*').order('created_at', { ascending: false })
  const ids = (invoices || []).map(i => i.id)
  if (!ids.length) return NextResponse.json({ invoices: [] })

  const [{ data: items }, { data: adjs }, { data: pays }] = await Promise.all([
    supabase.from('invoice_items').select('invoice_id, amount').in('invoice_id', ids),
    supabase.from('invoice_adjustments').select('invoice_id, amount').in('invoice_id', ids),
    supabase.from('invoice_payments').select('invoice_id, amount, status').in('invoice_id', ids),
  ])

  const sum = (rows: any[] | null, id: string, filter?: (r: any) => boolean) =>
    (rows || []).filter(r => r.invoice_id === id && (!filter || filter(r))).reduce((s, r) => s + Number(r.amount), 0)

  const enriched = (invoices || []).map(inv => {
    const itemTotal = sum(items, inv.id)
    const adjTotal = sum(adjs, inv.id)
    const paidTotal = sum(pays, inv.id, r => r.status === 'paid')
    const total = itemTotal - adjTotal
    return { ...inv, itemTotal, adjTotal, paidTotal, total, outstanding: total - paidTotal }
  })
  return NextResponse.json({ invoices: enriched })
}

// create an invoice (owner + co-owner)
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()
  const { contractor_name, contractor_contact, property_id, title, notes } = await request.json()
  if (!contractor_name || !title) return NextResponse.json({ error: 'Contractor and title required' }, { status: 400 })
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('invoices').insert({
    contractor_name, contractor_contact: contractor_contact || null,
    property_id: property_id || null, title, notes: notes || null,
    created_by: auth.ok ? auth.userId : null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, invoice: data })
}
