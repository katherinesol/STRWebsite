import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'

const PROPERTIES = [
  { id: 'royal-york-east', name: 'Royal York East Suite', location: 'Mimico · Toronto' },
  { id: 'royal-york-west', name: 'Royal York West Suite', location: 'Mimico · Toronto' },
  { id: 'nickel-beach',    name: 'Nickel Beach Retreat',  location: 'Port Colborne · Niagara' },
]

export default async function PropertiesPage() {
  const supabase = createAdminClient()
  const { data: settings } = await supabase
    .from('property_settings')
    .select('*')

  const settingsMap = Object.fromEntries((settings || []).map(s => [s.property_id, s]))

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Management</div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>Properties.</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        {PROPERTIES.map(p => {
          const s = settingsMap[p.id]
          return (
            <div key={p.id} style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: '24px' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '4px' }}>{p.location}</div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: '22px', fontWeight: 300, color: '#F5F2EC', marginBottom: '12px' }}>{p.name}</div>
                {s && (
                  <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                    {[
                      { label: 'Nightly', value: `$${s.nightly_rate}` },
                      { label: 'Cleaning', value: `$${s.cleaning_fee}` },
                      { label: 'Min stay', value: `${s.min_stay} nights` },
                      { label: 'Check-in', value: s.earliest_checkin },
                      { label: 'Checkout', value: s.latest_checkout },
                      { label: 'Deposit', value: `$${s.security_deposit_amount}` },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ fontSize: '9px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '2px' }}>{label}</div>
                        <div style={{ fontSize: '14px', color: '#F5F2EC' }}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Link href={`/admin/properties/${p.id}`} style={{
                padding: '10px 20px', background: '#363634', color: '#AEAEA6',
                fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase',
                textDecoration: 'none', whiteSpace: 'nowrap',
              }}>
                Edit →
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
