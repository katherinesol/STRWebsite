import { createAdminClient } from '@/lib/supabase/server'
import CalendarView from '@/components/admin/CalendarView'
import { syncICalToDB } from '@/lib/ical-sync'

export default async function CalendarPage() {
  // auto-sync all iCal feeds on calendar load
  await Promise.all([
    syncICalToDB('nickel-beach'),
    syncICalToDB('royal-york-east'),
    syncICalToDB('royal-york-west'),
  ])

  const supabase = createAdminClient()
  const [{ data: bookings }, { data: blocks }] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, property_id, check_in, check_out, guest_info:guests(name), status, early_checkin, early_checkin_time, early_checkin_granted, late_checkout, late_checkout_time, late_checkout_granted')
      .in('status', ['confirmed', 'active', 'pending_payment'])
      .order('check_in'),
    supabase
      .from('calendar_blocks')
      .select('*')
      .order('start_date'),
  ])

  return <CalendarView bookings={bookings || []} blocks={blocks || []} />
}
