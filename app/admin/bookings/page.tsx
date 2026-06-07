import { createAdminClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import Link from 'next/link'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach':    'Nickel Beach',
}

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  pending_payment: { label: 'Pending payment', color: '#f39c12', bg: '#2a1f0a' },
  confirmed:       { label: 'Confirmed',        color: '#2ecc71', bg: '#0a1f0f' },
  active:          { label: 'Active',           color: '#3498db', bg: '#0a1520' },
  completed:       { label: 'Completed',        color: '#9A9A92', bg: '#242422' },
  cancelled:       { label: 'Cancelled',        color: '#e74c3c', bg: '#1f0a0a' },
}

const PLATFORM_COLORS: Record<string, string> = {
  airbnb:  '#FF5A5F',
  vrbo:    '#3D6ECC',
  houfy:   '#2ECC71',
  manual:  '#f39c12',
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; property?: string; tab?: string }>
}) {
  const { status, property, tab = 'direct' } = await searchParams
  const supabase = createAdminClient()

  let directQuery = supabase
    .from('bookings')
    .select('*, guest_info:guests(name, email, phone)')
    .order('check_in', { ascending: false })

  if (status) directQuery = directQuery.eq('status', status)
  if (property) directQuery = directQuery.eq('property_id', property)

  const { data: bookings } = await directQuery

  const { data: platformBlocks } = await supabase
    .from('calendar_blocks')
    .select('*')
    .in('platform', ['airbnb', 'vrbo', 'houfy'])
    .order('start_date', { ascending: false })

  const statuses = ['pending_payment', 'confirmed', 'active', 'completed', 'cancelled']

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Management</div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>Bookings.</h1>
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: '1px', marginBottom: '20px' }}>
        {[
          { key: 'direct', label: `Direct (${bookings?.length || 0})` },
          { key: 'platform', label: `Platform (${platformBlocks?.length || 0})` },
        ].map(t => (
          <Link key={t.key} href={`/admin/bookings?tab=${t.key}`} style={{
            padding: '8px 20px', fontSize: '11px', letterSpacing: '.1em',
            textTransform: 'uppercase', textDecoration: 'none',
            background: tab === t.key ? '#F5F2EC' : '#363634',
            color: tab === t.key ? '#1A1A18' : '#9A9A92',
          }}>
            {t.label}
          </Link>
        ))}
      </div>

      {tab === 'direct' ? (
        <>
          {/* status + property filters */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '1px' }}>
              <Link href="/admin/bookings?tab=direct" style={{ padding: '6px 12px', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', textDecoration: 'none', background: !status ? '#F5F2EC' : '#363634', color: !status ? '#1A1A18' : '#9A9A92' }}>All</Link>
              {statuses.map(s => (
                <Link key={s} href={`/admin/bookings?tab=direct&status=${s}`} style={{ padding: '6px 12px', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', textDecoration: 'none', background: status === s ? '#F5F2EC' : '#363634', color: status === s ? '#1A1A18' : '#9A9A92' }}>
                  {STATUS_STYLES[s].label}
                </Link>
              ))}
            </div>
          </div>

          <div style={{ background: '#242422', border: '0.5px solid #363634' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 160px 120px 100px 80px', padding: '10px 20px', borderBottom: '0.5px solid #363634', fontSize: '9px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: '#666660' }}>
              <span>Guest</span><span>Property</span><span>Dates</span><span>Total</span><span>Status</span><span></span>
            </div>
            {!bookings?.length ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: '13px', color: '#666660' }}>No bookings found</div>
            ) : bookings.map(b => {
              const s = STATUS_STYLES[b.status]
              const guest = Array.isArray(b.guest_info) ? (b.guest_info as any[])[0] : b.guest_info as any
              return (
                <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 160px 120px 100px 80px', padding: '14px 20px', borderBottom: '0.5px solid #363634', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: '#F5F2EC', fontWeight: 500 }}>{guest?.name || '—'}</div>
                    <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>{guest?.email || '—'}</div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#AEAEA6' }}>{PROPERTY_NAMES[b.property_id]}</div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#F5F2EC' }}>{format(new Date(b.check_in), 'MMM d')} → {format(new Date(b.check_out), 'MMM d, yyyy')}</div>
                    <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>{b.nights} nights · {typeof b.guests === 'number' ? b.guests : '—'} guests</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: '#F5F2EC' }}>${b.total?.toFixed(0)}</div>
                    <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>{b.payment_method === 'etransfer' ? 'E-transfer' : 'Card'}</div>
                  </div>
                  <div>
                    <span style={{ display: 'inline-block', padding: '3px 8px', background: s.bg, color: s.color, fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase' }}>{s.label}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Link href={`/admin/bookings/${b.id}`} style={{ fontSize: '11px', color: 'var(--amber)', textDecoration: 'none' }}>View →</Link>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <>
          {/* platform bookings */}
          <div style={{ background: '#242422', border: '0.5px solid #363634' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 200px 120px 80px', padding: '10px 20px', borderBottom: '0.5px solid #363634', fontSize: '9px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: '#666660' }}>
              <span>Platform</span><span>Guest</span><span>Dates</span><span>Property</span><span></span>
            </div>
            {!platformBlocks?.length ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: '13px', color: '#666660' }}>No platform bookings found — sync your iCal feeds from the calendar page</div>
            ) : platformBlocks.map(b => (
              <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 200px 120px 80px', padding: '14px 20px', borderBottom: '0.5px solid #363634', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', padding: '3px 8px', background: '#1E1E1C', color: PLATFORM_COLORS[b.platform] || '#9A9A92' }}>
                    {b.platform}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: '#F5F2EC', fontWeight: 500 }}>{b.guest_name || '—'}</div>
                  {b.guest_notes && <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>{b.guest_notes}</div>}
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#F5F2EC' }}>{format(new Date(b.start_date), 'MMM d')} → {format(new Date(b.end_date), 'MMM d, yyyy')}</div>
                  <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>
                    In: {b.early_checkin_time || '4:00 PM'}{b.early_checkin_granted ? ' ★' : ''}
                    {' · '}
                    Out: {b.late_checkout_time || '11:00 AM'}{b.late_checkout_granted ? ' ★' : ''}
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#AEAEA6' }}>{PROPERTY_NAMES[b.property_id]}</div>
                <div style={{ textAlign: 'right' }}>
                  <Link href={`/admin/bookings/block/${b.id}`} style={{ fontSize: '11px', color: 'var(--amber)', textDecoration: 'none' }}>Edit →</Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ fontSize: '12px', color: '#666660', marginTop: '12px' }}>
        {tab === 'direct' ? `${bookings?.length || 0} booking${bookings?.length !== 1 ? 's' : ''}` : `${platformBlocks?.length || 0} platform booking${platformBlocks?.length !== 1 ? 's' : ''}`}
      </div>
    </div>
  )
}
