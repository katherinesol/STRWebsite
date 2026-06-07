import { createAdminClient } from '@/lib/supabase/server'
import { format, addDays } from 'date-fns'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach': 'Nickel Beach',
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      background: '#242422', border: '0.5px solid #363634',
      padding: '20px 24px',
    }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '8px' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300, color: accent ? 'var(--amber)' : '#F5F2EC', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '11px', color: '#888880', marginTop: '6px' }}>{sub}</div>}
    </div>
  )
}

export default async function AdminDashboard() {
  const supabase = createAdminClient()
  const today = new Date()
  const sevenDaysOut = addDays(today, 7)
  const todayStr = format(today, 'yyyy-MM-dd')
  const sevenDaysStr = format(sevenDaysOut, 'yyyy-MM-dd')

  // fetch data in parallel
  // platform blocks for dashboard
  const { data: platformCheckins } = await supabase
    .from('calendar_blocks')
    .select('*')
    .in('platform', ['airbnb', 'vrbo', 'houfy'])
    .gte('start_date', todayStr)
    .lte('start_date', sevenDaysStr)
    .order('start_date')

  const { data: platformCheckouts } = await supabase
    .from('calendar_blocks')
    .select('*')
    .in('platform', ['airbnb', 'vrbo', 'houfy'])
    .gte('end_date', todayStr)
    .lte('end_date', sevenDaysStr)
    .order('end_date')

  const { data: allPlatformBlocks } = await supabase
    .from('calendar_blocks')
    .select('id')
    .in('platform', ['airbnb', 'vrbo', 'houfy'])
    .gte('end_date', todayStr)

  const [
    { data: upcomingCheckins },
    { data: upcomingCheckouts },
    { data: overduePayments },
    { data: pendingEtransfers },
    { data: allBookings },
  ] = await Promise.all([
    supabase.from('bookings').select('*, guest_info:guests(name, email)').eq('status', 'confirmed').gte('check_in', todayStr).lte('check_in', sevenDaysStr).order('check_in'),
    supabase.from('bookings').select('*, guest_info:guests(name, email)').eq('status', 'active').gte('check_out', todayStr).lte('check_out', sevenDaysStr).order('check_out'),
    supabase.from('bookings').select('*, guest_info:guests(name, email)').in('status', ['confirmed', 'pending_payment']).or(`second_due_date.lt.${todayStr},final_due_date.lt.${todayStr}`),
    supabase.from('bookings').select('*, guest_info:guests(name, email)').eq('status', 'pending_payment').eq('payment_method', 'etransfer'),
    supabase.from('bookings').select('id, status, total').neq('status', 'cancelled'),
  ])

  const totalRevenue = allBookings?.filter(b => b.status === 'completed').reduce((sum, b) => sum + (b.total || 0), 0) || 0
  const activeBookings = (allBookings?.filter(b => ['confirmed', 'active'].includes(b.status)).length || 0) + (allPlatformBlocks?.length || 0)
  const allCheckins = [...(upcomingCheckins || []).map(b => ({ name: (Array.isArray(b.guest_info) ? (b.guest_info as any[])[0] : b.guest_info as any)?.name, property: b.property_id, date: b.check_in, nights: b.nights, type: 'direct' })), ...(platformCheckins || []).map(b => ({ name: b.guest_name || b.platform, property: b.property_id, date: b.start_date, nights: null, type: b.platform }))]
  const allCheckouts = [...(upcomingCheckouts || []).map(b => ({ name: (Array.isArray(b.guest_info) ? (b.guest_info as any[])[0] : b.guest_info as any)?.name, property: b.property_id, date: b.check_out, type: 'direct' })), ...(platformCheckouts || []).map(b => ({ name: b.guest_name || b.platform, property: b.property_id, date: b.end_date, type: b.platform }))]

  return (
    <div>
      {/* header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>
          {format(today, 'EEEE, MMMM d yyyy')}
        </div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '36px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>
          Good {today.getHours() < 12 ? 'morning' : today.getHours() < 17 ? 'afternoon' : 'evening'}.
        </h1>
      </div>

      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: '#363634', marginBottom: '32px' }}>
        <StatCard label="Active bookings" value={activeBookings} />
        <StatCard label="Check-ins this week" value={allCheckins.length} />
        <StatCard label="Pending e-transfers" value={pendingEtransfers?.length || 0} accent={!!pendingEtransfers?.length} />
        <StatCard label="Overdue payments" value={overduePayments?.length || 0} accent={!!overduePayments?.length} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

        {/* upcoming check-ins */}
        <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px' }}>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>
            Check-ins — next 7 days
          </div>
          {!upcomingCheckins?.length ? (
            <div style={{ fontSize: '13px', color: '#888880' }}>No check-ins this week</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {upcomingCheckins.map(b => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '0.5px solid #363634' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: '#F5F2EC', fontWeight: 500 }}>{(Array.isArray(b.guest_info) ? (b.guest_info as any[])[0] : b.guest_info as any)?.name || '—'}</div>
                    <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>{PROPERTY_NAMES[b.property_id]} · {b.guests} guests</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', color: 'var(--amber)' }}>{format(new Date(b.check_in), 'MMM d')}</div>
                    <div style={{ fontSize: '11px', color: '#9A9A92' }}>{b.nights} nights</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* upcoming check-outs */}
        <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px' }}>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>
            Check-outs — next 7 days
          </div>
          {!upcomingCheckouts?.length ? (
            <div style={{ fontSize: '13px', color: '#888880' }}>No check-outs this week</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {upcomingCheckouts.map(b => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '0.5px solid #363634' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: '#F5F2EC', fontWeight: 500 }}>{(Array.isArray(b.guest_info) ? (b.guest_info as any[])[0] : b.guest_info as any)?.name || '—'}</div>
                    <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>{PROPERTY_NAMES[b.property_id]}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', color: '#F5F2EC' }}>{format(new Date(b.check_out), 'MMM d')}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* pending e-transfers */}
        <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px' }}>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>
            Pending e-transfers
          </div>
          {!pendingEtransfers?.length ? (
            <div style={{ fontSize: '13px', color: '#888880' }}>No pending e-transfers</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {pendingEtransfers.map(b => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '0.5px solid #363634' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: '#F5F2EC', fontWeight: 500 }}>{(Array.isArray(b.guest_info) ? (b.guest_info as any[])[0] : b.guest_info as any)?.name || '—'}</div>
                    <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>{PROPERTY_NAMES[b.property_id]} · {format(new Date(b.check_in), 'MMM d')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', color: 'var(--amber)', fontWeight: 500 }}>${b.deposit_amount}</div>
                    <div style={{ fontSize: '10px', color: '#9A9A92', letterSpacing: '.06em' }}>AWAITING</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* overdue payments */}
        <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px' }}>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: overduePayments?.length ? '#e74c3c' : 'var(--amber)', marginBottom: '16px' }}>
            Overdue payments
          </div>
          {!overduePayments?.length ? (
            <div style={{ fontSize: '13px', color: '#888880' }}>No overdue payments</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {overduePayments.map(b => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '0.5px solid #363634' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: '#F5F2EC', fontWeight: 500 }}>{(Array.isArray(b.guest_info) ? (b.guest_info as any[])[0] : b.guest_info as any)?.name || '—'}</div>
                    <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>{PROPERTY_NAMES[b.property_id]} · {format(new Date(b.check_in), 'MMM d')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', color: '#e74c3c', fontWeight: 500 }}>OVERDUE</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
