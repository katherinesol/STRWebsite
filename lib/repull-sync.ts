import { createAdminClient } from '@/lib/supabase/server'

const REPULL_BASE = 'https://api.repull.dev/v1'

async function repullGet(path: string) {
  const key = process.env.REPULL_API_KEY
  if (!key) throw new Error('REPULL_API_KEY not set')
  const res = await fetch(`${REPULL_BASE}${path}`, { headers: { 'Authorization': `Bearer ${key}` } })
  if (!res.ok) throw new Error(`Repull ${res.status} on ${path}`)
  return res.json()
}

// map a Repull propertyId to your internal property_id (fill in as you connect listings)
const PROPERTY_MAP: Record<string, string> = {
  '23920': 'royal-york-west',   // Unit 2 — the operating suite
  '23919': 'nickel-beach',
  // '?????': 'royal-york-east',  // Unit 1 — connect in Repull once it goes live, then add its id here
}

// pull all Repull conversations + their messages into conversations/messages
export async function syncRepull(): Promise<{ threads: number; messages: number; errors: string[] }> {
  const supabase = createAdminClient()
  const errors: string[] = []
  let threads = 0, msgCount = 0

  const convList = await repullGet('/v1/conversations').catch((e) => { errors.push(e.message); return null })
  if (!convList) return { threads, messages: msgCount, errors }

  for (const conv of convList.data || []) {
    try {
      const channel = conv.platform || 'airbnb'   // platform may be null; default airbnb
      const propId = PROPERTY_MAP[conv.listingId] || null
      const { data: existing } = await supabase.from('conversations')
        .select('id').eq('channel', channel).eq('external_thread_id', String(conv.id)).maybeSingle()

      let convId = existing?.id
      if (!convId) {
        const { data: created, error } = await supabase.from('conversations').insert({
          channel, external_thread_id: String(conv.id), property_id: propId,
          booking_id: conv.reservationId ? String(conv.reservationId) : null,
          guest_name: conv.subject || 'Guest',
          status: conv.status || 'open',
          last_message_at: conv.lastMessageAt || conv.createdAt || new Date().toISOString(),
          last_message_preview: conv.lastMessagePreview || null,
        }).select('id').single()
        if (error) { errors.push(error.message); continue }
        convId = created.id
        threads++
      }

      // pull messages for this conversation
      const msgData = await repullGet(`/v1/conversations/${conv.id}/messages`)
      const msgs = msgData?.data?.messages || []
      for (const m of msgs) {
        const extId = String(m.externalMessageId || m.id)
        const { data: exists } = await supabase.from('messages')
          .select('id').eq('channel', channel).eq('external_message_id', extId).maybeSingle()
        if (exists) continue
        const isHost = m.direction === 'outbound' || m.senderType === 'host'
        await supabase.from('messages').insert({
          conversation_id: convId, channel,
          external_message_id: extId,
          sender: isHost ? 'host' : 'guest',
          direction: isHost ? 'out' : 'in',
          body: m.body || '',
          sent_at: m.sentAt || m.createdAt || new Date().toISOString(),
        })
        msgCount++
      }

      // update preview from the last message
      const last = msgs[msgs.length - 1]
      if (last) {
        await supabase.from('conversations').update({
          last_message_at: last.sentAt || last.createdAt || new Date().toISOString(),
          last_message_preview: (last.body || '').slice(0, 100),
        }).eq('id', convId)
      }
    } catch (e: any) { errors.push(e.message) }
  }

  return { threads, messages: msgCount, errors }
}
