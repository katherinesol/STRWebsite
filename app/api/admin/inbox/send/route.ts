import { NextRequest, NextResponse } from 'next/server'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { deliverMessage } from '@/lib/message-adapters'

// send a reply into a conversation (host or ai-authored, but sent by host action)
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()
  const { conversation_id, body, sender } = await request.json()
  if (!conversation_id || !body) return NextResponse.json({ error: 'conversation and body required' }, { status: 400 })
  const supabase = createAdminClient()

  const { data: conv } = await supabase.from('conversations').select('channel, external_thread_id, ai_paused').eq('id', conversation_id).maybeSingle()

  const { error } = await supabase.from('messages').insert({
    conversation_id, sender: sender || 'host', body,
    channel: conv?.channel || 'direct', sent_by: auth.ok ? auth.userId : null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // update conversation preview
  await supabase.from('conversations').update({
    last_message_at: new Date().toISOString(),
    last_message_preview: body.slice(0, 100),
  }).eq('id', conversation_id)

  // deliver to the platform if this is a host reply on an external channel
  let delivery: any = { ok: true }
  if ((sender || 'host') === 'host') {
    delivery = await deliverMessage(conv?.channel || 'direct', conv?.external_thread_id || null, body)
    // taking over a bot thread: pause the AI
    await supabase.from('conversations').update({ ai_paused: true }).eq('id', conversation_id)
  }
  return NextResponse.json({ ok: true, delivery })
}
