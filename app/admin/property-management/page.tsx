import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach':    'Nickel Beach',
}

export default async function PropertyManagementPage() {
  const supabase = createAdminClient()

  // low stock items
  const { data: lowStock } = await supabase
    .from('supplies')
    .select('*')
    .eq('active', true)
    .filter('quantity_on_hand', 'lte', 'reorder_point')

  // flagged items
  const { data: flagged } = await supabase
    .from('supply_logs')
    .select('*, supply:supply_id(name, property_id)')
    .eq('action', 'flagged')
    .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .order('created_at', { ascending: false })

  // this month finance
  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0)
  const { data: monthFinance } = await supabase
    .from('finance')
    .select('amount, hst_paid')
    .gte('date', startOfMonth.toISOString().split('T')[0])

  const monthTotal = (monthFinance || []).reduce((s, e) => s + (e.amount || 0), 0)
  const monthHst = (monthFinance || []).reduce((s, e) => s + (e.hst_paid || 0), 0)

  // this year km
  const startOfYear = new Date(); startOfYear.setMonth(0); startOfYear.setDate(1)
  const { data: yearTrips } = await supabase
    .from('trips')
    .select('km, reimbursement_amount')
    .gte('date', startOfYear.toISOString().split('T')[0])

  const yearKm = (yearTrips || []).reduce((s, t) => s + (t.km || 0), 0)
  const yearReimbursement = (yearTrips || []).reduce((s, t) => s + (t.reimbursement_amount || 0), 0)

  const modules = [
    { href: '/admin/property-management/supplies', label: 'Supplies', icon: '📦', desc: 'Track inventory, flag low stock, log restocks', alert: (lowStock?.length || 0) + (flagged?.length || 0) },
    { href: '/admin/property-management/trips', label: 'Trips', icon: '🚗', desc: `${yearKm.toFixed(0)} km this year · $${yearReimbursement.toFixed(2)} CRA`, alert: 0 },
    { href: '/admin/property-management/finance', label: 'Finance', icon: '💳', desc: `$${monthTotal.toFixed(2)} expenses this month`, alert: 0 },
  ]

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Management</div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>Property mgmt<span style={{ color: 'var(--amber)' }}>.</span></h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: '#363634', marginBottom: '32px' }}>
        {modules.map(m => (
          <Link key={m.href} href={m.href} style={{ background: '#242422', padding: '28px 24px', textDecoration: 'none', display: 'block', position: 'relative' }}>
            {m.alert > 0 && (
              <div style={{ position: 'absolute', top: '16px', right: '16px', background: '#e74c3c', color: '#fff', fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px' }}>{m.alert}</div>
            )}
            <div style={{ fontSize: '28px', marginBottom: '12px' }}>{m.icon}</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '22px', fontWeight: 300, color: '#F5F2EC', marginBottom: '6px' }}>{m.label}</div>
            <div style={{ fontSize: '12px', color: '#9A9A92', lineHeight: 1.5 }}>{m.desc}</div>
          </Link>
        ))}
      </div>

      {/* alerts */}
      {((lowStock?.length ?? 0) > 0 || (flagged?.length ?? 0) > 0) && (
        <div style={{ background: '#1f0a0a', border: '0.5px solid #3a1a1a', padding: '20px 24px' }}>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: '#e74c3c', marginBottom: '12px' }}>Needs attention</div>
          {(lowStock || []).map(item => (
            <div key={item.id} style={{ fontSize: '13px', color: '#F5F2EC', padding: '6px 0', borderBottom: '0.5px solid #2a1a1a' }}>
              ⚠ {item.name} — low stock ({item.quantity_on_hand} {item.unit || 'units'} remaining) · {PROPERTY_NAMES[item.property_id]}
            </div>
          ))}
          {(flagged || []).map(log => (
            <div key={log.id} style={{ fontSize: '13px', color: '#F5F2EC', padding: '6px 0', borderBottom: '0.5px solid #2a1a1a' }}>
              🚩 {(log.supply as any)?.name} flagged — {log.note || 'needs restock'} · {PROPERTY_NAMES[(log.supply as any)?.property_id]}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
