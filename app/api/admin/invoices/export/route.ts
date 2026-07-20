import { NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// export paid invoice payments as CSV (for Bodega import)
export async function GET() {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()
  const { data: payments } = await supabase
    .from('invoice_payments')
    .select('amount, paid_at, method, invoices:invoice_id(contractor_name, title, property_id)')
    .eq('status', 'paid')
    .order('paid_at')

  const header = 'date,vendor,description,amount,property,method'
  const rows = (payments || []).map((p: any) => {
    const inv = p.invoices || {}
    const esc = (s: any) => `"${String(s ?? '').replace(/"/g, '""')}"`
    return [p.paid_at || '', esc(inv.contractor_name), esc(`Payment — ${inv.title}`), Number(p.amount).toFixed(2), inv.property_id || '', p.method || ''].join(',')
  })
  const csv = [header, ...rows].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="invoice-payments-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  })
}
