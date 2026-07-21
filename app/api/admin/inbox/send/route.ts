import { NextRequest, NextResponse } from 'next/server'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// send a reply into a conversation (host or ai-authored, but sent by host action)
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()
  const { conversation_id, body, sender } = await request.json()
  if (!conversation_id || !body) return NextResponse.json({ error: 'conversation and body required' }, { status: 400 })
  const supabase = createAdminClient()

  const { data: conv } = await supabase.from('conversations').select('channel').eq('id', conversation_id).maybeSingle()

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

  // NOTE: actually delivering to the guest (SMS/email/Houfy) happens in the channel connector — phase 2
  return NextResponse.json({ ok: true })
}
