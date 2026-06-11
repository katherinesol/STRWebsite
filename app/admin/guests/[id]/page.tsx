import { createAdminClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import Link from 'next/link'
import GuestForm from '@/components/admin/GuestForm'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach':    'Nickel Beach',
}

export default async function GuestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const guestData = await supabase.from('guests').select('*').eq('id', id).single()
  const guest = guestData.data
  if (!guest) notFound()

  const [{ data: bookings }, { data: referrals }, { data: platformBlocks }] = await Promise.all([
    supabase.from('bookings').select('*').eq('guest_id', id).order('check_in', { ascending: false }),
    supabase.from('referrals').select('*, referred:referred_guest_id(name), referrer:referrer_guest_id(name)').or(`referrer_guest_id.eq.${id},referred_guest_id.eq.${id}`),
    supabase.from('calendar_blocks').select('*').eq('guest_id', id).eq('is_booking', true).order('start_date', { ascending: false }),
  ])

  if (!guest) notFound()

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/admin/guests" style={{ fontSize: '11px', color: '#9A9A92', textDecoration: 'none', letterSpacing: '.06em' }}>← Guests</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>{guest.name}</h1>
            <div style={{ fontSize: '12px', color: '#9A9A92', marginTop: '4px' }}>{guest.email} · {guest.phone || 'No phone'}</div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {guest.returning_guest && <span style={{ fontSize: '9px', padding: '4px 10px', background: '#0a1520', color: '#3498db', letterSpacing: '.1em', textTransform: 'uppercase' }}>Returning</span>}
            {guest.locked_rate_enabled && <span style={{ fontSize: '9px', padding: '4px 10px', background: '#2a1f0a', color: '#f39c12', letterSpacing: '.1em', textTransform: 'uppercase' }}>Locked rate</span>}
            {guest.id_verified && <span style={{ fontSize: '9px', padding: '4px 10px', background: '#0a1f0f', color: '#2ecc71', letterSpacing: '.1em', textTransform: 'uppercase' }}>ID Verified</span>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '16px', alignItems: 'start' }}>
        <div>
          {/* booking history */}
          <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', marginBottom: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>Booking history</div>
            {(() => {
              const directStays = (bookings || []).map((b: any) => ({
                id: b.id,
                property_id: b.property_id,
                check_in: b.check_in,
                check_out: b.check_out,
                nights: b.nights,
                total: b.total,
                source: 'direct',
                booking_id: b.id,
              }))
              const platformStays = (platformBlocks || []).map((b: any) => ({
                id: b.id,
                property_id: b.property_id,
                check_in: b.start_date,
                check_out: b.end_date,
                nights: Math.round((new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86400000),
                total: b.payout_amount || b.amount_paid || null,
                source: b.platform,
                booking_id: null,
                block_id: b.id,
              }))
              const allStays = [...directStays, ...platformStays].sort((a, b) => b.check_in > a.check_in ? 1 : -1)
              if (!allStays.length) return <div style={{ fontSize: '13px', color: '#666660' }}>No bookings yet</div>
              return allStays.map(b => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '0.5px solid #363634' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ fontSize: '13px', color: '#F5F2EC' }}>{PROPERTY_NAMES[b.property_id]}</div>
                      {b.source !== 'direct' && <span style={{ fontSize: '9px', padding: '2px 8px', background: '#1a1a18', color: '#9A9A92', border: '0.5px solid #363634', letterSpacing: '.08em', textTransform: 'uppercase' }}>{b.source}</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>
                      {format(new Date(b.check_in + 'T12:00:00'), 'MMM d')} → {format(new Date(b.check_out + 'T12:00:00'), 'MMM d, yyyy')} · {b.nights} nights
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', color: '#F5F2EC' }}>{b.total ? `$${b.total}` : '—'}</div>
                    {b.booking_id ? (
                      <Link href={`/admin/bookings/${b.booking_id}`} style={{ fontSize: '11px', color: 'var(--amber)', textDecoration: 'none' }}>View →</Link>
                    ) : b.block_id ? (
                      <Link href={`/admin/bookings/block/${b.block_id}`} style={{ fontSize: '11px', color: 'var(--amber)', textDecoration: 'none' }}>View →</Link>
                    ) : null}
                  </div>
                </div>
              ))
            })()}
          </div>

          {/* referrals */}
          {!!referrals?.length && (
            <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>Referrals</div>
              {referrals.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '0.5px solid #363634', fontSize: '13px' }}>
                  <div style={{ color: '#AEAEA6' }}>
                    {r.referrer_guest_id === id
                      ? `Referred ${(r.referred as any)?.name}`
                      : `Referred by ${(r.referrer as any)?.name}`}
                  </div>
                  <span style={{
                    fontSize: '9px', padding: '2px 8px',
                    background: r.referrer_reward_status === 'applied' ? '#0a1f0f' : '#2a1f0a',
                    color: r.referrer_reward_status === 'applied' ? '#2ecc71' : '#f39c12',
                    letterSpacing: '.08em', textTransform: 'uppercase',
                  }}>
                    {r.referrer_guest_id === id ? r.referrer_reward_status : r.referred_reward_status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* edit panel */}
        <div style={{ position: 'sticky', top: '32px' }}>
          <GuestForm guest={guest} />
        </div>
      </div>
    </div>
  )
}
