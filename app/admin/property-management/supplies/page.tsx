import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import SuppliesManager from '@/components/admin/SuppliesManager'

export const dynamic = 'force-dynamic'

export default async function SuppliesPage() {
  const supabase = createAdminClient()

  const [{ data: supplies }, { data: logs }, { data: teamMembers }] = await Promise.all([
    supabase.from('supplies').select('*').eq('active', true).order('property_id').order('category').order('name'),
    supabase.from('supply_logs').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('team_members').select('*').order('name'),
  ])

  return (
    <div>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <Link href="/admin/property-management" style={{ fontSize: '11px', color: '#9A9A92', textDecoration: 'none' }}>← Property mgmt</Link>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F5F2EC', marginTop: '8px' }}>Supplies.</h1>
        </div>
      </div>
      <SuppliesManager supplies={supplies || []} logs={logs || []} teamMembers={teamMembers || []} />
    </div>
  )
}
