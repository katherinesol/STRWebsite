import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// Guest sends a message to the host → creates/updates a conversation in the inbox.
export async function POST(request: NextRequest) {
  const { code, booking_id, source, message } = await request.json()
  if (!code || !booking_id || !message?.trim()) return NextResponse.json({ error: 'Missing info' }, { status: 400 })
  const supabase = createAdminClient()
  const codeUp = String(code).trim().toUpperCase()

  // re-verify + get booking context
  let propertyId: string | null = null, guestName: string | null = null, guestId: string | null = null
  if (source === 'direct') {
    const { data } = await supabase.from('bookings').select('property_id, guest_id, confirmation_code, guest:guests(name)').eq('id', booking_id).ilike('confirmation_code', codeUp).maybeSingle()
    if (data) { propertyId = data.property_id; guestName = (data.guest as any)?.name; guestId = data.guest_id }
  } else {
    const { data } = await supabase.from('calendar_blocks').select('property_id, guest_id, guest_name, confirmation_code').eq('id', booking_id).ilike('confirmation_code', codeUp).maybeSingle()
    if (data) { propertyId = data.property_id; guestName = data.guest_name; guestId = data.guest_id }
  }
  if (!propertyId) return NextResponse.json({ error: 'Verification failed' }, { status: 403 })

  // find or create a conversation for this booking
  let convId: string
  const { data: existing } = await supabase.from('conversations').select('id').eq('booking_id', booking_id).maybeSingle()
  if (existing) {
    convId = existing.id
    await supabase.from('conversations').update({ last_message_at: new Date().toISOString(), last_message_preview: message.slice(0, 100), unread: true }).eq('id', convId)
  } else {
    const { data: conv } = await supabase.from('conversations').insert({
      property_id: propertyId, guest_id: guestId, guest_name: guestName || 'Guest',
      channel: 'direct', booking_id, unread: true, last_message_preview: message.slice(0, 100),
    }).select('id').single()
    convId = conv!.id
  }
  await supabase.from('messages').insert({ conversation_id: convId, sender: 'guest', body: message, channel: 'direct' })

  return NextResponse.json({ ok: true })
}
