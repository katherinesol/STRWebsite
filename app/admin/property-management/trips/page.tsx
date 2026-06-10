import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import TripsManager from '@/components/admin/TripsManager'

export default async function TripsPage() {
  const supabase = createAdminClient()

  const [{ data: trips }, { data: teamMembers }, { data: bookings }] = await Promise.all([
    supabase.from('trips').select('*').order('date', { ascending: false }).limit(100),
    supabase.from('team_members').select('*').order('name'),
    supabase.from('bookings').select('id, property_id, check_in, check_out, booking_reference, guest_info:guests(name)')
      .in('status', ['confirmed', 'active'])
      .order('check_in', { ascending: false })
      .limit(20),
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

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/admin/property-management" style={{ fontSize: '11px', color: '#9A9A92', textDecoration: 'none' }}>← Property mgmt</Link>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F5F2EC', marginTop: '8px' }}>Trips.</h1>
      </div>
      <TripsManager trips={trips || []} teamMembers={teamMembers || []} bookings={bookings || []} yearTotals={yearTotals} />
    </div>
  )
}
