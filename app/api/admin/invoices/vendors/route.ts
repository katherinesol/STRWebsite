import { NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// derive contractor + payment-method suggestions from existing invoices and expenses
export async function GET() {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()

  const [{ data: invoices }, { data: expenses }, { data: payments }] = await Promise.all([
    supabase.from('invoices').select('contractor_name, company, contractor_contact'),
    supabase.from('expenses').select('vendor'),
    supabase.from('invoice_payments').select('method, method_detail, method_last4').eq('status', 'paid'),
  ])

  // build a map of contractors keyed by lowercased name — most complete record wins
  const contractors: Record<string, any> = {}
  for (const inv of invoices || []) {
    const key = (inv.contractor_name || '').trim().toLowerCase()
    if (!key) continue
    const existing = contractors[key] || { contractor_name: inv.contractor_name, company: '', contractor_contact: '' }
    contractors[key] = {
      contractor_name: inv.contractor_name,
      company: inv.company || existing.company,
      contractor_contact: inv.contractor_contact || existing.contractor_contact,
    }
  }
  // add expense vendors as name-only suggestions if not already present
  for (const ex of expenses || []) {
    const key = (ex.vendor || '').trim().toLowerCase()
    if (!key || contractors[key]) continue
    contractors[key] = { contractor_name: ex.vendor, company: '', contractor_contact: '' }
  }

  // distinct payment methods (method + detail + last4)
  const methodSet: Record<string, any> = {}
  for (const p of payments || []) {
    if (!p.method) continue
    const key = `${p.method}|${p.method_detail || ''}|${p.method_last4 || ''}`
    methodSet[key] = { method: p.method, method_detail: p.method_detail || '', method_last4: p.method_last4 || '' }
  }

  return NextResponse.json({
    contractors: Object.values(contractors).sort((a: any, b: any) => a.contractor_name.localeCompare(b.contractor_name)),
    methods: Object.values(methodSet),
  })
}
