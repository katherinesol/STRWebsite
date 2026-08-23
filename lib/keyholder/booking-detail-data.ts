import { createAdminClient } from '@/lib/supabase/server'
import { PAYMENT_COLUMNS } from '@/lib/keyholder/payment'

/** Everything 2a needs, in one place so the two routes cannot drift apart.
 *  Read only — this loads a page, it does not touch a lock or a platform. */
export async function loadBookingDetail(kind: 'direct' | 'platform', id: string) {
  const supabase = createAdminClient()
  const table = kind === 'direct' ? 'bookings' : 'calendar_blocks'

  const { data: b } = await supabase.from(table)
    .select(kind === 'direct' ? `*, ${PAYMENT_COLUMNS}` : '*')
    .eq('id', id).maybeSingle()
  if (!b) return null
  if (kind === 'platform' && (b as any).is_booking === false) return null

  const row = b as any
  const [{ data: locks }, { data: guest }, { data: convs }, { data: gifts }] = await Promise.all([
    supabase.from('property_locks').select('*').eq('property_id', row.property_id).eq('active', true),
    row.guest_id
      ? supabase.from('guests').select('*').eq('id', row.guest_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('conversations').select('*').eq('booking_id', id).limit(1),
    // booking_id ONLY. The note text must never reach this page — see GiftCard.
    supabase.from('booking_gifts').select('booking_id').eq('booking_id', id).not('note', 'is', null),
  ])

  const conversation = (convs || [])[0] || null
  let messages: any[] = []
  if (conversation) {
    const { data } = await supabase.from('messages')
      .select('id, body, direction, created_at').eq('conversation_id', conversation.id)
      .order('created_at').limit(20)
    messages = data || []
  }

  return { b: row, locks: locks || [], guest: guest || null, conversation, messages, hasGift: (gifts || []).length > 0 }
}
