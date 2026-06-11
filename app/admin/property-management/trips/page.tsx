import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import TripsManager from '@/components/admin/TripsManager'

export default async function TripsPage() {
  const supabase = createAdminClient()

  const [{ data: trips }, { data: teamMembers }, { data: bookings }, { data: platformBlocks }] = await Promise.all([
    supabase.from('trips').select('*').order('date', { ascending: false }).limit(100),
    supabase.from('team_members').select('*').order('name'),
    supabase.from('bookings').select('id, property_id, check_in, check_out, booking_reference, guest_info:guests(name)')
      .gte('check_in', new Date().getFullYear() + '-01-01')
      .order('check_in', { ascending: true })
      .limit(50),
    supabase.from('calendar_blocks')
      .select('id, property_id, start_date, end_date, guest_name, platform')
      .in('platform', ['airbnb', 'vrbo', 'houfy'])
      .eq('is_booking', true)
      .gte('start_date', new Date().getFullYear() + '-01-01')
      .order('start_date', { ascending: true })
      .limit(50),
  ])

  // calculate year totals per person
  const startOfYear = new Date().getFullYear() + '-01-01'
  const { data: yearTrips } = await supabase
    .from('trips')
    .select('person, km, reimbursement_amount')
    .gte('date', startOfYear)

  const yearTotals = (yearTrips || []).reduce((acc, t) => {
    if (!acc[t.person]) acc[t.person] = { km: 0, reimbursement: 0 }
    acc[t.person].km += t.km || 0
    acc[t.person].reimbursement += t.reimbursement_amount || 0
    return acc
  }, {} as Record<string, { km: number; reimbursement: number }>)

  // merge direct bookings and platform blocks for trip linking
  const allBookings = [
    ...(bookings || []).map(b => ({
      id: b.id,
      property_id: b.property_id,
      check_in: b.check_in,
      booking_reference: b.booking_reference,
      guest_name: Array.isArray(b.guest_info) ? b.guest_info[0]?.name : (b.guest_info as any)?.name,
      source: 'direct',
    })),
    ...(platformBlocks || []).map(b => ({
      id: b.id,
      property_id: b.property_id,
      check_in: b.start_date,
      booking_reference: b.platform?.toUpperCase(),
      guest_name: b.guest_name || `${b.platform?.toUpperCase()} booking`,
      source: b.platform,
    })),
  ].sort((a, b) => a.check_in > b.check_in ? 1 : -1)

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/admin/property-management" style={{ fontSize: '11px', color: '#9A9A92', textDecoration: 'none' }}>← Property mgmt</Link>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F5F2EC', marginTop: '8px' }}>Trips.</h1>
      </div>
      <TripsManager trips={trips || []} teamMembers={teamMembers || []} bookings={allBookings} yearTotals={yearTotals} />
    </div>
  )
}
