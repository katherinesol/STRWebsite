import { createAdminClient } from '@/lib/supabase/server'

type LogEvent = {
  propertyId: string
  eventType: 'new_booking' | 'cancelled' | 'extended' | 'date_change' | 'time_request' | 'time_approved' | 'block_added' | 'block_removed'
  description: string
  bookingId?: string | null
  bookingKind?: string | null
  guestName?: string | null
  actorId?: string | null
  actorName?: string | null
  meta?: Record<string, any>
}

// Log a calendar change. Fire-and-forget — never throws into the caller's flow.
export async function logCalendarActivity(e: LogEvent): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase.from('calendar_activity').insert({
      property_id: e.propertyId,
      event_type: e.eventType,
      description: e.description,
      booking_id: e.bookingId || null,
      booking_kind: e.bookingKind || null,
      guest_name: e.guestName || null,
      actor_id: e.actorId || null,
      actor_name: e.actorName || null,
      meta: e.meta || {},
    })
  } catch {
    // logging must never break the actual operation
  }
}
