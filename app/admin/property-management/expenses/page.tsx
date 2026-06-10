import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import ExpensesManager from '@/components/admin/ExpensesManager'

export default async function ExpensesPage() {
  const supabase = createAdminClient()

  const { data: expenses } = await supabase
    .from('expenses')
    .select('*')
    .order('date', { ascending: false })
    .limit(200)

  // group vendors for autocomplete
  const vendors = [...new Set((expenses || []).map(e => e.vendor).filter(Boolean))]

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/admin/property-management" style={{ fontSize: '11px', color: '#9A9A92', textDecoration: 'none' }}>← Property mgmt</Link>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F5F2EC', marginTop: '8px' }}>Expenses.</h1>
      </div>
      <ExpensesManager expenses={expenses || []} vendors={vendors} />
    </div>
  )
}
