import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/server'

const PROP_NAMES: Record<string, string> = { 'royal-york-east': 'Royal York East', 'royal-york-west': 'Royal York West', 'nickel-beach': 'Nickel Beach Retreat' }

// Guest sends a photo. Store it, let the concierge look at it, help if it's an info question, escalate if it's a problem.
export async function POST(request: NextRequest) {
  const { code, booking_id, source, imageBase64, mediaType, caption } = await request.json()
  if (!code || !booking_id || !imageBase64) return NextResponse.json({ error: 'Missing photo' }, { status: 400 })
  const supabase = createAdminClient()
  const codeUp = String(code).trim().toUpperCase()

  // re-verify + get booking context
  let booking: any = null
  if (source === 'direct') {
    const { data } = await supabase.from('bookings').select('property_id, confirmation_code, lock_code, guest:guests(name)').eq('id', booking_id).ilike('confirmation_code', codeUp).maybeSingle()
    if (data) booking = { property_id: data.property_id, guest_name: (data.guest as any)?.name, door_code: data.lock_code }
  } else {
    const { data } = await supabase.from('calendar_blocks').select('property_id, confirmation_code, door_code, guest_name').eq('id', booking_id).ilike('confirmation_code', codeUp).maybeSingle()
    if (data) booking = { property_id: data.property_id, guest_name: data.guest_name, door_code: data.door_code }
  }
  if (!booking) return NextResponse.json({ error: 'Verification failed' }, { status: 403 })

  // PHOTO LIMIT: cap photos per hour per booking (vision is pricier)
  try {
    const { data: c } = await supabase.from('conversations').select('id').eq('booking_id', booking_id).maybeSingle()
    if (c) {
      const hourAgo = new Date(Date.now() - 3600000).toISOString()
      const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('conversation_id', c.id).eq('sender', 'guest').gte('created_at', hourAgo)
      if ((count || 0) >= 40) return NextResponse.json({ answer: "Let's continue in a little while — for anything urgent, your host is happy to help directly." })
    }
  } catch {}

  // store the photo
  let photoUrl: string | null = null
  try {
    const bytes = Buffer.from(imageBase64, 'base64')
    const path = `guest-photos/${booking_id}-${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('property-management').upload(path, bytes, { contentType: mediaType || 'image/jpeg' })
    if (!upErr) photoUrl = path
  } catch {}

  // knowledge base for this property
  const { data: kb } = await supabase.from('knowledge_base').select('topic, title, content').eq('active', true)
    .or(`property_id.eq.${booking.property_id},property_id.eq.general`)
  const knowledge = (kb || []).map(k => `[${k.topic}] ${k.title}: ${k.content}`).join('\n')

  // let the concierge look at the photo
  const systemPrompt = `You are the Zuhaus Virtual Concierge for ${PROP_NAMES[booking.property_id]}. A guest sent a photo${caption ? ' with this note: "' + caption + '"' : ''}. Look at it and respond warmly.

PROPERTY INFO:
${knowledge || '(no knowledge base entries)'}

CRITICAL RULES:
- If the photo shows a HOW-TO or WHERE-IS question you can answer from the knowledge base (an appliance control, a setting, a location), help warmly and clearly.
- If the photo shows ANYTHING broken, leaking, damaged, an electrical/plumbing/gas issue, a safety concern, or you're not sure — do NOT attempt to diagnose or give repair advice. Warmly tell them you're alerting the host who will help right away, and begin your reply with [[ESCALATE]].
- Never give electrical, plumbing, gas, or structural repair instructions. Those always escalate.
- Keep it warm, calm, brief. No markdown asterisks.`

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const resp = await client.messages.create({
      model: 'claude-sonnet-5', max_tokens: 500, system: systemPrompt,
      messages: [{ role: 'user', content: [
        { type: 'image' as const, source: { type: 'base64' as const, media_type: (mediaType || 'image/jpeg') as any, data: imageBase64 } },
        { type: 'text' as const, text: caption || 'Here is a photo.' },
      ] as any }],
    })
    const text = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
    const escalated = text.includes('[[ESCALATE]]')
    const clean = text.split('[[ESCALATE]]').join('').trim()

    // persist to inbox conversation (with the photo)
    try {
      let convId: string
      const { data: existing } = await supabase.from('conversations').select('id').eq('booking_id', booking_id).maybeSingle()
      if (existing) {
        convId = existing.id
        await supabase.from('conversations').update({ last_message_at: new Date().toISOString(), last_message_preview: '📷 Photo from guest', unread: escalated ? true : undefined }).eq('id', convId)
      } else {
        const { data: conv } = await supabase.from('conversations').insert({ property_id: booking.property_id, guest_name: booking.guest_name || 'Guest', channel: 'direct', booking_id, unread: escalated, last_message_preview: '📷 Photo from guest' }).select('id').single()
        convId = conv!.id
      }
      await supabase.from('messages').insert({ conversation_id: convId, sender: 'guest', body: (caption ? caption + '\n' : '') + (photoUrl ? `[photo: ${photoUrl}]` : '[photo]'), channel: 'direct' })
      await supabase.from('messages').insert({ conversation_id: convId, sender: 'ai', body: clean, channel: 'direct' })
    } catch {}

    return NextResponse.json({ answer: clean, escalated, photoUrl })
  } catch (err: any) {
    return NextResponse.json({ error: 'Could not process photo' }, { status: 500 })
  }
}
