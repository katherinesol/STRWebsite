import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEscalationAlert } from '@/lib/email'

const BRAND = 'Zuhaus'  // guest-facing concierge brand — change here when finalized

// Guest assistant: answers questions grounded in the property knowledge base + the guest's own booking.
// Re-verifies the booking on every call (code + booking_id) so it can't be spoofed.
export async function POST(request: NextRequest) {
  const { code, booking_id, source, messages } = await request.json()
  if (!code || !booking_id || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const supabase = createAdminClient()
  const codeUp = String(code).trim().toUpperCase()

  // re-verify booking matches the code
  let booking: any = null
  if (source === 'direct') {
    const { data } = await supabase.from('bookings')
      .select('id, property_id, check_in, check_out, confirmation_code, lock_code, total, deposit_amount, deposit_paid_at, final_payment_amount, final_paid_at, guest:guests(name)')
      .eq('id', booking_id).ilike('confirmation_code', codeUp).maybeSingle()
    if (data) booking = {
      property_id: data.property_id, guest_name: (data.guest as any)?.name,
      check_in: data.check_in, check_out: data.check_out, door_code: data.lock_code,
      payment: `Total $${data.total ?? '?'}. Deposit ${data.deposit_paid_at ? 'paid' : 'pending'}. Final payment ${data.final_paid_at ? 'paid' : 'pending'}.`,
    }
  } else {
    const { data } = await supabase.from('calendar_blocks')
      .select('id, property_id, start_date, end_date, confirmation_code, door_code, guest_name, guest_total')
      .eq('id', booking_id).ilike('confirmation_code', codeUp).maybeSingle()
    if (data) booking = {
      property_id: data.property_id, guest_name: data.guest_name,
      check_in: data.start_date, check_out: data.end_date, door_code: data.door_code,
      payment: 'Your booking was made and paid through the platform (Airbnb/VRBO).',
    }
  }
  if (!booking) return NextResponse.json({ error: 'Verification expired. Please re-enter your code.' }, { status: 403 })

  // property knowledge base (+ general)
  const { data: kb } = await supabase.from('knowledge_base').select('topic, title, content').eq('active', true)
    .or(`property_id.eq.${booking.property_id},property_id.eq.general`)
  const knowledge = (kb || []).map(k => `[${k.topic}] ${k.title}: ${k.content}`).join('\n')

  const PROP_NAMES: Record<string, string> = { 'royal-york-east': 'Royal York East', 'royal-york-west': 'Royal York West', 'nickel-beach': 'Nickel Beach Retreat' }
  const first = (booking.guest_name || '').split(' ')[0]

  const systemPrompt = `You are the ${BRAND} concierge for ${PROP_NAMES[booking.property_id] || 'the property'} — a warm, polished, effortless concierge at a boutique hotel. You greet guests by name, anticipate their needs, and make everything feel graceful. Present but never intrusive.

THEIR BOOKING:
- Guest: ${booking.guest_name || 'Guest'}
- Check-in: ${booking.check_in} / Check-out: ${booking.check_out}
- Door code: ${booking.door_code || 'not yet set — let them know it will be provided closer to check-in'}
- Payment: ${booking.payment}

PROPERTY INFO (your knowledge base — the ONLY source for property facts):
${knowledge || '(no knowledge base entries yet)'}

VOICE — Warm. Polished. Effortless:
- Lead with warmth, then function. ${first ? `Address them as ${first} naturally, once or twice — not every line.` : ''}
- Calm, complete sentences. Gracious, never curt. At most one exclamation point, often none.
- Use phrases like "Of course," "Happily," "My pleasure," "I'd be glad to," "Shall I," "Just let me know."
- Avoid "Yep / Sure thing / No problem / Unfortunately." Reframe limitations positively.
- After answering, gently anticipate the next need ("Would you like the check-in details as well?").
- Keep most replies to 1–3 sentences. No markdown asterisks or bold — write clean prose. State facts plainly, e.g. "Your door code is 5688."

MEMORY: You do remember our conversation for the length of the stay — the guest can scroll back anytime. If asked whether you remember them, reassure them warmly that their conversation is saved throughout their stay. (Within a single chat you always have full context.)

RULES:
- Share their own booking details freely (dates, door code, payment) — they are verified.
- For property facts, use ONLY the knowledge base. If something is NOT in it, do NOT guess. Instead, tell them gracefully that you have passed it to the host who will follow up, and begin that exact sentence with the token [[ESCALATE]] (the system removes this token before the guest sees it). Example: "[[ESCALATE]]Let me check with your host on that and they will be in touch shortly."
- For urgent or safety issues (gas smell, leak, lockout, injury), tell them to contact the host immediately, and also begin with [[ESCALATE]].
- Never reveal other guests' or other bookings' information.`

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const resp = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 700,
      system: systemPrompt,
      messages: messages.map((m: any) => ({ role: m.role, content: String(m.content) })),
    })
    const text = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')

    // detect auto-escalation token, strip it from guest-facing text
    const shouldEscalate = text.indexOf('[[ESCALATE]]') !== -1
    const cleanText = text.split('[[ESCALATE]]').join('').trim()

    // persist the exchange to the inbox conversation (guest history + host visibility)
    try {
      const lastUser = [...messages].reverse().find((m: any) => m.role === 'user')
      let convId: string
      const { data: existing } = await supabase.from('conversations').select('id').eq('booking_id', booking_id).maybeSingle()
      if (existing) {
        convId = existing.id
        const upd: any = { last_message_at: new Date().toISOString(), last_message_preview: (lastUser?.content || '').slice(0, 100) }
        if (shouldEscalate) upd.unread = true
        await supabase.from('conversations').update(upd).eq('id', convId)
      } else {
        const { data: conv } = await supabase.from('conversations').insert({
          property_id: booking.property_id, guest_name: booking.guest_name || 'Guest',
          channel: 'direct', booking_id, unread: shouldEscalate,
          last_message_preview: (lastUser?.content || '').slice(0, 100),
        }).select('id').single()
        convId = conv!.id
      }
      if (lastUser?.content) await supabase.from('messages').insert({ conversation_id: convId, sender: 'guest', body: lastUser.content, channel: 'direct' })
      await supabase.from('messages').insert({ conversation_id: convId, sender: 'ai', body: cleanText, channel: 'direct' })
      if (shouldEscalate) {
        await supabase.from('messages').insert({ conversation_id: convId, sender: 'ai', body: 'Auto-escalated: the assistant could not answer this and flagged it for you.', channel: 'direct' })
        const PROP: Record<string, string> = { 'royal-york-east': 'Royal York East', 'royal-york-west': 'Royal York West', 'nickel-beach': 'Nickel Beach Retreat' }
        sendEscalationAlert({ guestName: booking.guest_name || 'A guest', propertyName: PROP[booking.property_id] || booking.property_id, question: lastUser?.content || '', checkIn: booking.check_in, checkOut: booking.check_out }).catch(() => {})
      }
    } catch {}

    return NextResponse.json({ answer: cleanText, escalated: shouldEscalate })
  } catch (err: any) {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
