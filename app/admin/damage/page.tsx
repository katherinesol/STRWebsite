import { createAdminClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import Link from 'next/link'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach':    'Nickel Beach',
}

export default async function DamagePage() {
  const supabase = createAdminClient()

  const { data: reports } = await supabase
    .from('damage_reports')
    .select('*, bookings(check_in, check_out, guests(name), security_deposit_status)')
    .order('created_at', { ascending: false })

  const total = reports?.reduce((sum, r) => sum + (r.amount_claimed || 0), 0) || 0

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Management</div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>Damage reports.</h1>
        </div>
        <Link href="/admin/damage/new" style={{
          padding: '10px 20px', background: 'var(--amber)', color: '#1A1A18',
          fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase',
          textDecoration: 'none', fontWeight: 500,
        }}>
          + New report
        </Link>
      </div>

      {/* summary */}
      <div style={{ display: 'flex', gap: '1px', marginBottom: '24px' }}>
        {[
          { label: 'Total reports', value: reports?.length || 0 },
          { label: 'Total claimed', value: `$${total.toFixed(0)}` },
          { label: 'Linked to deposit', value: reports?.filter(r => r.linked_to_deposit).length || 0 },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: '#242422', border: '0.5px solid #363634', padding: '16px 24px', flex: 1 }}>
            <div style={{ fontSize: '9px', letterSpacing: '.14em', textTransform: 'uppercase', color: '#666660', marginBottom: '6px' }}>{label}</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F5F2EC' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* reports list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        {!reports?.length ? (
          <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '40px', textAlign: 'center', fontSize: '13px', color: '#666660' }}>
            No damage reports
          </div>
        ) : reports.map(r => {
          const booking = r.bookings as any
          const guest = booking?.guests
          return (
            <div key={r.id} style={{ background: '#242422', border: '0.5px solid #363634', padding: '20px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 120px 120px', gap: '16px', alignItems: 'start' }}>
                <div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--amber)' }}>
                      {PROPERTY_NAMES[r.property_id]}
                    </span>
                    {r.linked_to_deposit && (
                      <span style={{ fontSize: '9px', padding: '2px 6px', background: '#2a1f0a', color: '#f39c12', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                        Deposit linked
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '14px', color: '#F5F2EC', fontWeight: 500, marginBottom: '3px' }}>{r.item}</div>
                  {r.location && <div style={{ fontSize: '12px', color: '#9A9A92' }}>Location: {r.location}</div>}
                  {r.description && <div style={{ fontSize: '12px', color: '#AEAEA6', marginTop: '6px', lineHeight: 1.5 }}>{r.description}</div>}
                  {guest && (
                    <div style={{ fontSize: '11px', color: '#666660', marginTop: '6px' }}>
                      Guest: {guest.name} · {booking?.check_in ? format(new Date(booking.check_in), 'MMM d, yyyy') : '—'}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#666660', marginBottom: '4px' }}>Claimed</div>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: '24px', fontWeight: 300, color: r.amount_claimed ? '#e74c3c' : '#666660' }}>
                    {r.amount_claimed ? `$${r.amount_claimed}` : '—'}
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#666660' }}>
                  {format(new Date(r.created_at), 'MMM d, yyyy')}
                </div>
                <div>
                  {booking?.id && (
                    <Link href={`/admin/bookings/${booking.id}`} style={{ fontSize: '11px', color: 'var(--amber)', textDecoration: 'none', letterSpacing: '.06em' }}>
                      View booking →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
