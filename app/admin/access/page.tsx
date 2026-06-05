import { createAdminClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import Link from 'next/link'
import AccessManager from '@/components/admin/AccessManager'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach':    'Nickel Beach',
}

export default async function AccessPage() {
  const supabase = createAdminClient()

  const [
    { data: codes },
    { data: activeBookings },
    { data: propertySettings },
  ] = await Promise.all([
    supabase
      .from('access_codes')
      .select('*, bookings(check_in, check_out, property_id, guests(name))')
      .is('revoked_at', null)
      .order('generated_at', { ascending: false }),
    supabase
      .from('bookings')
      .select('*, guests(name)')
      .in('status', ['confirmed', 'active'])
      .order('check_in'),
    supabase
      .from('property_settings')
      .select('property_id, schlage_devices'),
  ])

  const lockMap = Object.fromEntries(
    (propertySettings || []).map(s => [s.property_id, s.schlage_devices || []])
  )

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Management</div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>Access.</h1>
      </div>

      {/* active codes */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>
          Active codes
        </div>
        {!codes?.length ? (
          <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', fontSize: '13px', color: '#666660' }}>
            No active access codes
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {codes.map(c => {
              const booking = c.bookings as any
              const guest = booking?.guests
              return (
                <div key={c.id} style={{ background: '#242422', border: '0.5px solid #363634', padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 160px 180px auto', alignItems: 'center', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: '#F5F2EC', fontWeight: 500 }}>{guest?.name || '—'}</div>
                    <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>
                      {PROPERTY_NAMES[booking?.property_id]} · {booking?.check_in ? format(new Date(booking.check_in), 'MMM d') : '—'} → {booking?.check_out ? format(new Date(booking.check_out), 'MMM d') : '—'}
                    </div>
                    {c.notes && <div style={{ fontSize: '11px', color: '#666660', marginTop: '2px' }}>{c.notes}</div>}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '18px', color: 'var(--amber)', letterSpacing: '.12em' }}>
                    {c.code}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666660' }}>
                    Generated {format(new Date(c.generated_at), 'MMM d, yyyy')}
                  </div>
                  <RevokeButton codeId={c.id} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* generate codes for upcoming bookings */}
      <div>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>
          Upcoming bookings — generate access
        </div>
        {!activeBookings?.length ? (
          <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', fontSize: '13px', color: '#666660' }}>
            No upcoming confirmed bookings
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {activeBookings.map(b => {
              const guest = b.guests as any
              const locks = lockMap[b.property_id] || []
              const existingCodes = codes?.filter(c => (c.bookings as any)?.check_in === b.check_in) || []
              return (
                <div key={b.id} style={{ background: '#242422', border: '0.5px solid #363634', padding: '20px 24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                      <div style={{ fontSize: '14px', color: '#F5F2EC', fontWeight: 500 }}>{guest?.name || '—'}</div>
                      <div style={{ fontSize: '12px', color: '#9A9A92', marginTop: '3px' }}>
                        {PROPERTY_NAMES[b.property_id]} · {format(new Date(b.check_in), 'MMM d')} → {format(new Date(b.check_out), 'MMM d, yyyy')}
                      </div>
                    </div>
                    <Link href={`/admin/bookings/${b.id}`} style={{ fontSize: '11px', color: 'var(--amber)', textDecoration: 'none' }}>
                      View booking →
                    </Link>
                  </div>
                  <AccessManager
                    bookingId={b.id}
                    propertyId={b.property_id}
                    locks={locks}
                    existingCodes={existingCodes.map(c => ({ id: c.id, code: c.code, notes: c.notes }))}
                    bookingRef={b.booking_reference ? b.booking_reference.slice(-4) : b.id.replace(/-/g, '').slice(-4)}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function RevokeButton({ codeId }: { codeId: string }) {
  return (
    <form action={`/api/admin/access/${codeId}/revoke`} method="POST">
      <button type="submit" style={{
        padding: '6px 12px', background: '#1f0a0a', color: '#e74c3c',
        border: '0.5px solid #3a1a1a', fontFamily: 'var(--sans)',
        fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer',
      }}>
        Revoke
      </button>
    </form>
  )
}
