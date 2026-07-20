import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// PUBLIC — no auth. Contractor views invoice by share token.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createAdminClient()
  const { data: invoice } = await supabase.from('invoices').select('*').eq('share_token', token).maybeSingle()
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: items }, { data: adjustments }, { data: payments }] = await Promise.all([
    supabase.from('invoice_items').select('description, amount').eq('invoice_id', invoice.id),
    supabase.from('invoice_adjustments').select('description, amount').eq('invoice_id', invoice.id),
    supabase.from('invoice_payments').select('amount, paid_at, status').eq('invoice_id', invoice.id),
  ])
  const sum = (r: any[] | null, f?: (x: any) => boolean) => (r || []).filter(x => !f || f(x)).reduce((s, x) => s + Number(x.amount), 0)
  const total = sum(items) - sum(adjustments)
  const paid = sum(payments, p => p.status === 'paid')

  return NextResponse.json({
    contractor_name: invoice.contractor_name,
    title: invoice.title,
    items, adjustments,
    total, paid, outstanding: total - paid,
    acknowledged_at: invoice.acknowledged_at,
  })
}

// contractor taps "Acknowledge"
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createAdminClient()
  const { error } = await supabase.from('invoices').update({ acknowledged_at: new Date().toISOString() }).eq('share_token', token)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
