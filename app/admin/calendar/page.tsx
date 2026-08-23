import { createAdminClient } from '@/lib/supabase/server'
import MobileAgenda from '@/components/admin/MobileAgenda'
import CalendarView from '@/components/admin/CalendarView'

export default async function CalendarPage() {
  // Read only. iCal syncing runs from the daily cron and the explicit Sync-now
  // button — never from a page view. See lib/ical-sync.ts.
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

  return (
    <>
      <div className="cal-desktop">
        <CalendarView bookings={bookings || []} blocks={blocks || []} />
      </div>
      <MobileAgenda bookings={bookings || []} blocks={blocks || []} />
    </>
  )
}
