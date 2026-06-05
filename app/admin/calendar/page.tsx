import { createAdminClient } from '@/lib/supabase/server'
import CalendarView from '@/components/admin/CalendarView'

export default async function CalendarPage() {
  const supabase = createAdminClient()

  const [
    { data: bookings },
    { data: blocks },
  ] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, property_id, check_in, check_out, guests(name), status')
      .in('status', ['confirmed', 'active', 'pending_payment'])
      .order('check_in'),
    supabase
      .from('calendar_blocks')
      .select('*')
      .order('start_date'),
  ])

  return <CalendarView bookings={bookings || []} blocks={blocks || []} />
}
