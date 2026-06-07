import { createAdminClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import Link from 'next/link'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach': 'Nickel Beach',
}

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  pending_payment: { label: 'Pending payment', color: '#f39c12', bg: '#2a1f0a' },
  confirmed:       { label: 'Confirmed',        color: '#2ecc71', bg: '#0a1f0f' },
  active:          { label: 'Active',           color: '#3498db', bg: '#0a1520' },
  completed:       { label: 'Completed',        color: '#AEAEA6', bg: '#1a1a18' },
  cancelled:       { label: 'Cancelled',        color: '#e74c3c', bg: '#1f0a0a' },
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; property?: string }>
}) {
  const { status, property } = await searchParams
  const supabase = createAdminClient()

  let query = supabase
    .from('bookings')
    .select('*, guest_info:guests(name, email, phone)')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (property) query = query.eq('property_id', property)

  const { data: bookings } = await query

  const statuses = ['pending_payment', 'confirmed', 'active', 'completed', 'cancelled']

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>
            Management
          </div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>
            Bookings.
          </h1>
        </div>
      </div>

      {/* filters */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {/* status filter */}
        <div style={{ display: 'flex', gap: '1px' }}>
          <Link href="/admin/bookings" style={{
            padding: '6px 12px', fontSize: '10px', letterSpacing: '.1em',
            textTransform: 'uppercase', textDecoration: 'none',
            background: !status ? '#F5F2EC' : '#363634',
            color: !status ? '#242422' : '#AEAEA6',
          }}>All</Link>
          {statuses.map(s => (
            <Link key={s} href={`/admin/bookings?status=${s}${property ? `&property=${property}` : ''}`} style={{
              padding: '6px 12px', fontSize: '10px', letterSpacing: '.1em',
              textTransform: 'uppercase', textDecoration: 'none',
              background: status === s ? '#F5F2EC' : '#363634',
              color: status === s ? '#242422' : '#AEAEA6',
            }}>
              {STATUS_STYLES[s].label}
            </Link>
          ))}
        </div>

        {/* property filter */}
        <div style={{ display: 'flex', gap: '1px', marginLeft: 'auto' }}>
          {Object.entries(PROPERTY_NAMES).map(([id, name]) => (
            <Link key={id} href={`/admin/bookings?${status ? `status=${status}&` : ''}property=${id}`} style={{
              padding: '6px 12px', fontSize: '10px', letterSpacing: '.1em',
              textTransform: 'uppercase', textDecoration: 'none',
              background: property === id ? 'var(--amber)' : '#363634',
              color: property === id ? '#242422' : '#AEAEA6',
            }}>
              {name}
            </Link>
          ))}
        </div>
      </div>

      {/* table */}
      <div style={{ background: '#242422', border: '0.5px solid #363634' }}>
        {/* header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 140px 160px 120px 100px 80px',
          padding: '10px 20px', borderBottom: '0.5px solid #363634',
          fontSize: '9px', fontWeight: 500, letterSpacing: '.14em',
          textTransform: 'uppercase', color: '#888880',
        }}>
          <span>Guest</span>
          <span>Property</span>
          <span>Dates</span>
          <span>Total</span>
          <span>Status</span>
          <span></span>
        </div>

        {/* rows */}
        {!bookings?.length ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: '13px', color: '#888880' }}>
            No bookings found
          </div>
        ) : bookings.map(b => {
          const s = STATUS_STYLES[b.status]
          const guest = Array.isArray(b.guest_info) ? (b.guest_info as any[])[0] : b.guest_info as any
          return (
            <div key={b.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 140px 160px 120px 100px 80px',
              padding: '14px 20px', borderBottom: '0.5px solid #363634',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: '13px', color: '#F5F2EC', fontWeight: 500 }}>{guest?.name || '—'}</div>
                <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>{guest?.email || '—'}</div>
              </div>
              <div style={{ fontSize: '12px', color: '#888880' }}>{PROPERTY_NAMES[b.property_id]}</div>
              <div>
                <div style={{ fontSize: '12px', color: '#F5F2EC' }}>
                  {format(new Date(b.check_in), 'MMM d')} → {format(new Date(b.check_out), 'MMM d, yyyy')}
                </div>
                <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>{b.nights} nights · {b.guests} guests</div>
              </div>
              <div>
                <div style={{ fontSize: '13px', color: '#F5F2EC' }}>${b.total?.toFixed(0)}</div>
                <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>
                  {b.payment_method === 'etransfer' ? 'E-transfer' : 'Card'}
                </div>
              </div>
              <div>
                <span style={{
                  display: 'inline-block', padding: '3px 8px',
                  background: s.bg, color: s.color,
                  fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase',
                }}>
                  {s.label}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Link href={`/admin/bookings/${b.id}`} style={{
                  fontSize: '11px', color: 'var(--amber)',
                  textDecoration: 'none', letterSpacing: '.06em',
                }}>
                  View →
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: '12px', color: '#888880', marginTop: '12px' }}>
        {bookings?.length || 0} booking{bookings?.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
