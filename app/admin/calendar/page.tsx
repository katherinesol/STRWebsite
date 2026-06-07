import { createAdminClient } from '@/lib/supabase/server'
import CalendarView from '@/components/admin/CalendarView'

const ICAL_PROPERTIES = ['nickel-beach', 'royal-york-east', 'royal-york-west']
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export default async function CalendarPage() {
  const supabase = createAdminClient()

  // auto-sync iCal feeds on every calendar load
  await Promise.all(
    ICAL_PROPERTIES.map(id =>
      fetch(`${BASE_URL}/api/calendar?property=${id}&save=1`, {
        cache: 'no-store',
      }).catch(() => null)
    )
  )

  const [
    { data: bookings },
    { data: blocks },
  ] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, property_id, check_in, check_out, guest_info:guests(name), status')
      .in('status', ['confirmed', 'active', 'pending_payment'])
      .order('check_in'),
    supabase
      .from('calendar_blocks')
      .select('*')
      .order('start_date'),
  ])

  return <CalendarView bookings={bookings || []} blocks={blocks || []} />
}
