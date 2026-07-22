import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// Returns the full message history for a verified booking's conversation. Guest polls this.
export async function POST(request: NextRequest) {
  const { code, booking_id, source } = await request.json()
  if (!code || !booking_id) return NextResponse.json({ error: 'Invalid' }, { status: 400 })
  const supabase = createAdminClient()
  const codeUp = String(code).trim().toUpperCase()

  // re-verify the code matches the booking (can't poll someone else's convo)
  const table = source === 'platform' ? 'calendar_blocks' : 'bookings'
  const { data: b } = await supabase.from(table).select('id').eq('id', booking_id).ilike('confirmation_code', codeUp).maybeSingle()
  if (!b) return NextResponse.json({ error: 'Verification failed' }, { status: 403 })

  const { data: conv } = await supabase.from('conversations').select('id').eq('booking_id', booking_id).maybeSingle()
  if (!conv) return NextResponse.json({ messages: [] })

  const { data: msgs } = await supabase.from('messages').select('sender, body, created_at').eq('conversation_id', conv.id).order('created_at')
  const history = (msgs || [])
    .filter((m: any) => m.sender === 'guest' || m.sender === 'ai' || m.sender === 'host')
    .filter((m: any) => !String(m.body).startsWith('Auto-escalated:'))
    .map((m: any) => ({ role: m.sender === 'guest' ? 'user' : 'assistant', content: m.body, host: m.sender === 'host' }))
  return NextResponse.json({ messages: history })
}
