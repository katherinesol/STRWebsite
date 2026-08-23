import { createAdminClient } from '@/lib/supabase/server'
import MonthGrid from '@/components/keyholder/MonthGrid'
import StayAgenda from '@/components/keyholder/StayAgenda'

// Read only. iCal syncing runs from the daily cron and the explicit Sync-now
// endpoint — never from a page view. See lib/ical-sync.ts.
export const dynamic = 'force-dynamic'

export default async function CalendarPage() {
  const supabase = createAdminClient()
  const [{ data: bookings }, { data: blocks }] = await Promise.all([
    supabase.from('bookings')
      .select('id, property_id, check_in, check_out, guest_info:guests(name), status, total, accommodation, deposit_amount, deposit_paid_at, second_payment_amount, second_paid_at, final_payment_amount, final_paid_at, early_checkin, early_checkin_time, early_checkin_granted, late_checkout, late_checkout_time, late_checkout_granted')
      .in('status', ['confirmed', 'active', 'pending_payment'])
      .order('check_in'),
    supabase.from('calendar_blocks').select('*').order('start_date'),
  ])
  // The grid needs seven columns to carry meaning; below that it becomes a list.
  // Both render server-side and CSS picks one, so there is no flash on load.
  return (
    <>
      <div className="kh-wide"><MonthGrid bookings={bookings || []} blocks={blocks || []} /></div>
      <div className="kh-narrow"><StayAgenda bookings={bookings || []} blocks={blocks || []} /></div>
    </>
  )
}
