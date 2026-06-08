import { createAdminClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import Link from 'next/link'

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const supabase = createAdminClient()

  let query = supabase
    .from('guests')
    .select('*, bookings(id, property_id, check_in, status), calendar_blocks(id)')
    .order('created_at', { ascending: false })

  if (q) {
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`)
  }

  const { data: guests } = await query

  return (
    <div>
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Management</div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>Guests.</h1>
        </div>
      </div>

      {/* search */}
      <form method="GET" style={{ marginBottom: '20px' }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name or email..."
          style={{
            width: '100%', maxWidth: '400px', padding: '10px 14px',
            background: '#363634', border: '0.5px solid #4A4A48',
            color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
            outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
          }}
        />
      </form>

      {/* table */}
      <div style={{ background: '#242422', border: '0.5px solid #363634' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 180px 100px 80px 80px',
          padding: '10px 20px', borderBottom: '0.5px solid #363634',
          fontSize: '9px', fontWeight: 500, letterSpacing: '.14em',
          textTransform: 'uppercase', color: '#666660',
        }}>
          <span>Guest</span>
          <span>Last stay</span>
          <span>Bookings</span>
          <span>Flags</span>
          <span></span>
        </div>

        {!guests?.length ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: '13px', color: '#666660' }}>
            No guests found
          </div>
        ) : guests.map(g => {
          const bookings = (g.bookings as any[]) || []
          const platformStays = (g.calendar_blocks as any[]) || []
          const totalStays = bookings.length + platformStays.length
          const lastBooking = bookings.sort((a, b) => b.check_in > a.check_in ? 1 : -1)[0]
          return (
            <div key={g.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 180px 100px 80px 80px',
              padding: '14px 20px', borderBottom: '0.5px solid #363634',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: '13px', color: '#F5F2EC', fontWeight: 500 }}>{g.name}</div>
                <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>{g.email}</div>
              </div>
              <div style={{ fontSize: '12px', color: '#AEAEA6' }}>
                {lastBooking ? format(new Date(lastBooking.check_in), 'MMM d, yyyy') : '—'}
              </div>
              <div style={{ fontSize: '13px', color: '#AEAEA6' }}>{totalStays}</div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {g.returning_guest && (
                  <span style={{ fontSize: '9px', padding: '2px 6px', background: '#0a1520', color: '#3498db', letterSpacing: '.08em', textTransform: 'uppercase' }}>Return</span>
                )}
                {g.locked_rate_enabled && (
                  <span style={{ fontSize: '9px', padding: '2px 6px', background: '#2a1f0a', color: '#f39c12', letterSpacing: '.08em', textTransform: 'uppercase' }}>Locked rate</span>
                )}
                {g.id_verified && (
                  <span style={{ fontSize: '9px', padding: '2px 6px', background: '#0a1f0f', color: '#2ecc71', letterSpacing: '.08em', textTransform: 'uppercase' }}>Verified</span>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <Link href={`/admin/guests/${g.id}`} style={{ fontSize: '11px', color: 'var(--amber)', textDecoration: 'none', letterSpacing: '.06em' }}>
                  View →
                </Link>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: '12px', color: '#666660', marginTop: '12px' }}>
        {guests?.length || 0} guest{guests?.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
