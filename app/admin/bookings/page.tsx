import { createAdminClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import Link from 'next/link'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach':    'Nickel Beach',
}

function getAutoStatus(checkIn: string, checkOut: string, checkInTime?: string | null, checkOutTime?: string | null): { label: string; color: string; bg: string } {
  const now = new Date()
  const torontoDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })
  const torontoTime = now.toLocaleTimeString('en-GB', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hour12: false })
  const inTime = checkInTime || '16:00'
  const outTime = checkOutTime || '11:00'

  if (checkOut < torontoDate) return { label: 'Completed', color: '#AEAEA6', bg: '#1E1E1C' }
  if (checkOut === torontoDate && torontoTime >= outTime) return { label: 'Completed', color: '#AEAEA6', bg: '#1E1E1C' }
  if (checkIn === torontoDate && torontoTime < inTime) return { label: 'Checking in today', color: '#f39c12', bg: '#2a1f0a' }
  if (checkIn <= torontoDate && checkOut >= torontoDate) return { label: 'Active', color: '#3498db', bg: '#0a1520' }
  return { label: 'Upcoming', color: '#2ecc71', bg: '#0a1f0f' }
}

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  pending_payment: { label: 'Pending',   color: '#f39c12', bg: '#2a1f0a' },
  confirmed:       { label: 'Confirmed', color: '#2ecc71', bg: '#0a1f0f' },
  active:          { label: 'Active',    color: '#3498db', bg: '#0a1520' },
  completed:       { label: 'Completed', color: '#9A9A92', bg: '#242422' },
  cancelled:       { label: 'Cancelled', color: '#e74c3c', bg: '#1f0a0a' },
}

const PLATFORM_COLORS: Record<string, string> = {
  airbnb: '#FF5A5F',
  vrbo:   '#3D6ECC',
  houfy:  '#2ECC71',
  direct: '#B8956B',
}

function formatTime(time: string | null, standard: string): string {
  if (!time) return standard
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  const min = parseInt(m) >= 30 ? '30' : '00'
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${min} ${ampm}`
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string; show_completed?: string }>
}) {
  const { property, show_completed } = await searchParams
  const showCompleted = show_completed === '1'
  const supabase = createAdminClient()

  let directQuery = supabase
    .from('bookings')
    .select('*, guest_info:guests(name, email, phone)')
    .neq('status', 'cancelled')
    .order('check_in', { ascending: true })

  if (property) directQuery = directQuery.eq('property_id', property)

  const [{ data: bookings }, { data: platformBlocks }] = await Promise.all([
    directQuery,
    supabase
      .from('calendar_blocks')
      .select('*')
      .in('platform', ['airbnb', 'vrbo', 'houfy'])
      .order('start_date', { ascending: true }),
  ])

  // merge and sort by date
  type Row = {
    id: string
    type: 'direct' | 'platform'
    property_id: string
    date: string
    data: any
  }



  const directRows: Row[] = (bookings || [])
    .filter(b => showCompleted || getAutoStatus(b.check_in, b.check_out).label !== 'Completed')
    .map(b => ({
    id: b.id,
    type: 'direct',
    property_id: b.property_id,
    date: b.check_in,
    data: b,
  }))

  const platformRows: Row[] = (platformBlocks || [])
    .filter(b => !property || b.property_id === property)
    .filter(b => showCompleted || getAutoStatus(b.start_date, b.end_date).label !== 'Completed')
    .filter(b => {
      const days = Math.round((new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86400000)
      // exclude prep days: 1-day blocks explicitly marked as not a booking
      return (b as any).is_booking === true
    })
    .map(b => ({
      id: b.id,
      type: 'platform',
      property_id: b.property_id,
      date: b.start_date,
      data: b,
    }))

  const allRows = [...directRows, ...platformRows].sort((a, b) =>
    a.date.localeCompare(b.date)
  )

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Management</div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>Bookings.</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link href="/admin/bookings/import" style={{ padding: '10px 20px', background: '#363634', color: '#9A9A92', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', textDecoration: 'none' }}>
            Import historical
          </Link>
          <Link href="/admin/bookings/new" style={{ padding: '10px 20px', background: 'var(--amber)', color: '#1A1A18', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', textDecoration: 'none', fontWeight: 500 }}>
            + Manual booking
          </Link>
        </div>
      </div>

      {/* completed toggle + property filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
      <div style={{ display: 'flex', gap: '1px' }}>
        <Link href="/admin/bookings" style={{ padding: '6px 14px', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', textDecoration: 'none', background: !property ? '#F5F2EC' : '#363634', color: !property ? '#1A1A18' : '#9A9A92' }}>All</Link>
        {Object.entries(PROPERTY_NAMES).map(([id, name]) => (
          <Link key={id} href={`/admin/bookings?property=${id}${showCompleted ? '&show_completed=1' : ''}`} style={{ padding: '6px 14px', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', textDecoration: 'none', background: property === id ? 'var(--amber)' : '#363634', color: property === id ? '#1A1A18' : '#9A9A92' }}>
            {name}
          </Link>
        ))}
      </div>
      <Link
        href={`/admin/bookings?${property ? `property=${property}&` : ''}${showCompleted ? '' : 'show_completed=1'}`}
        style={{ fontSize: '11px', letterSpacing: '.08em', textTransform: 'uppercase', textDecoration: 'none', padding: '6px 14px', background: showCompleted ? '#F5F2EC' : '#363634', color: showCompleted ? '#1A1A18' : '#9A9A92' }}
      >
        {showCompleted ? 'Hide completed' : 'Show completed'}
      </Link>
      </div>

      {/* unified table */}
      <div style={{ background: '#242422', border: '0.5px solid #363634' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 160px 180px 100px 80px', padding: '10px 20px', borderBottom: '0.5px solid #363634', fontSize: '9px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: '#666660' }}>
          <span>Source</span><span>Guest</span><span>Property</span><span>Dates & times</span><span>Status</span><span></span>
        </div>

        {!allRows.length ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: '13px', color: '#666660' }}>No bookings found</div>
        ) : allRows.map(row => {
          if (row.type === 'direct') {
            const b = row.data
            const s = getAutoStatus(b.check_in, b.check_out, b.early_checkin_granted ? b.early_checkin_time : null, b.late_checkout_granted ? b.late_checkout_time : null)
            const guest = Array.isArray(b.guest_info) ? b.guest_info[0] : b.guest_info
            const checkInTime = b.early_checkin_granted && b.early_checkin_time
              ? formatTime(b.early_checkin_time, '4:00 PM')
              : '4:00 PM'
            const checkOutTime = b.late_checkout_granted && b.late_checkout_time
              ? formatTime(b.late_checkout_time, '11:00 AM')
              : '11:00 AM'
            return (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 160px 180px 100px 80px', padding: '14px 20px', borderBottom: '0.5px solid #363634', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '9px', padding: '3px 8px', background: '#1E1E1C', color: PLATFORM_COLORS.direct, letterSpacing: '.08em', textTransform: 'uppercase' }}>Direct</span>
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: '#F5F2EC', fontWeight: 500 }}>{guest?.name || '—'}</div>
                  <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>{guest?.email || '—'}</div>
                </div>
                <div style={{ fontSize: '12px', color: '#AEAEA6' }}>{PROPERTY_NAMES[b.property_id]}</div>
                <div>
                  <div style={{ fontSize: '12px', color: '#F5F2EC' }}>{format(new Date(b.check_in + 'T12:00:00'), 'MMM d, yyyy')} → {format(new Date(b.check_out + 'T12:00:00'), 'MMM d, yyyy')}</div>
                  <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>
                    In {checkInTime}{b.early_checkin_granted ? ' ★' : ''} · Out {checkOutTime}{b.late_checkout_granted ? ' ★' : ''}
                  </div>
                </div>
                <div>
                  <span style={{ display: 'inline-block', padding: '3px 8px', background: s.bg, color: s.color, fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase' }}>{s.label}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Link href={`/admin/bookings/${b.id}`} style={{ fontSize: '11px', color: 'var(--amber)', textDecoration: 'none' }}>View →</Link>
                </div>
              </div>
            )
          } else {
            const b = row.data
            const checkInTime = b.early_checkin_time ? formatTime(b.early_checkin_time, '4:00 PM') : '4:00 PM'
            const checkOutTime = b.late_checkout_time ? formatTime(b.late_checkout_time, '11:00 AM') : '11:00 AM'
            return (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 160px 180px 100px 80px', padding: '14px 20px', borderBottom: '0.5px solid #363634', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '9px', padding: '3px 8px', background: '#1E1E1C', color: PLATFORM_COLORS[b.platform] || '#9A9A92', letterSpacing: '.08em', textTransform: 'uppercase' }}>{b.platform}</span>
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: '#F5F2EC', fontWeight: 500 }}>{b.guest_name || '—'}</div>
                  {b.guest_notes && <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>{b.guest_notes}</div>}
                </div>
                <div style={{ fontSize: '12px', color: '#AEAEA6' }}>{PROPERTY_NAMES[b.property_id]}</div>
                <div>
                  <div style={{ fontSize: '12px', color: '#F5F2EC' }}>{format(new Date(b.start_date + 'T12:00:00'), 'MMM d, yyyy')} → {format(new Date(b.end_date + 'T12:00:00'), 'MMM d, yyyy')}</div>
                  <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>
                    In {checkInTime}{b.early_checkin_granted ? ' ★' : ''} · Out {checkOutTime}{b.late_checkout_granted ? ' ★' : ''}
                  </div>
                </div>
                <div>
                  {(() => { const ps = getAutoStatus(b.start_date, b.end_date, b.early_checkin_time, b.late_checkout_time); return <span style={{ display: 'inline-block', padding: '3px 8px', background: ps.bg, color: ps.color, fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase' }}>{ps.label}</span> })()}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Link href={`/admin/bookings/block/${b.id}`} style={{ fontSize: '11px', color: 'var(--amber)', textDecoration: 'none' }}>Edit →</Link>
                </div>
              </div>
            )
          }
        })}
      </div>
      <div style={{ fontSize: '12px', color: '#666660', marginTop: '12px' }}>{allRows.length} booking{allRows.length !== 1 ? 's' : ''}</div>
    </div>
  )
}
