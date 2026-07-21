import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return new Response('Not allowed', { status: 403 })
  const { conversation_id } = await request.json()
  if (!conversation_id) return new Response('conversation_id required', { status: 400 })

  const supabase = createAdminClient()
  const [{ data: conv }, { data: msgs }] = await Promise.all([
    supabase.from('conversations').select('*').eq('id', conversation_id).maybeSingle(),
    supabase.from('messages').select('sender, body, created_at').eq('conversation_id', conversation_id).order('created_at'),
  ])
  if (!conv) return new Response('Not found', { status: 404 })

  // greeting context: greet if this is a new conversation or 24h+ since the last message
  const msgList = msgs || []
  const hostMsgs = msgList.filter(m => m.sender !== 'guest')
  const lastHostMsg = hostMsgs[hostMsgs.length - 1]
  const hoursSinceLastHost = lastHostMsg ? (Date.now() - new Date(lastHostMsg.created_at).getTime()) / 3600000 : Infinity
  const shouldGreet = hostMsgs.length === 0 || hoursSinceLastHost >= 24
  const hour = new Date().getHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const firstName = (conv.guest_name || '').split(' ')[0].replace(/[()]/g, '')

  // pull the property's knowledge base (+ general)
  const { data: kb } = await supabase
    .from('knowledge_base')
    .select('topic, title, content')
    .eq('active', true)
    .or(`property_id.eq.${conv.property_id},property_id.eq.general`)

  const knowledge = (kb || []).map(k => `[${k.topic}] ${k.title}: ${k.content}`).join('\n')
  const conversation = (msgs || []).map(m => `${m.sender === 'guest' ? 'Guest' : 'Host'}: ${m.body}`).join('\n')

  const systemPrompt = `You are the host's assistant drafting a reply to a guest for a short-term rental. You draft; the host reviews and sends.

PROPERTY INFORMATION (the only facts you may use):
${knowledge || '(no knowledge base entries yet)'}

RULES:
- Write a warm, concise, professional reply the host can send as-is or lightly edit.
- Only state facts found in the property information above. Never invent details (wifi passwords, codes, times, policies).
- If the guest asks something not covered, draft a reply that acknowledges warmly and says the host will follow up — do not guess.
- For anything urgent or safety-related (gas smell, water leak, lockout, injury), draft a reply telling them to call the host immediately, and keep it brief.
- Match a friendly hospitality tone. No preamble, no "here's a draft" — just the reply text itself.
${shouldGreet ? `- Open with a natural, time-appropriate greeting using the guest's first name "${firstName}" (it is currently ${timeOfDay} — e.g. "Good ${timeOfDay} ${firstName}!" or "Hi ${firstName}!"). Only greet once at the start.` : `- Do NOT open with a greeting or the guest's name — this is a continuing conversation, just answer naturally.`}`

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const msgStream = await client.messages.stream({
          model: 'claude-sonnet-5',
          max_tokens: 600,
          system: systemPrompt,
          messages: [{ role: 'user', content: `Here is the conversation so far:\n\n${conversation}\n\nDraft the host's next reply.` }],
        })
        for await (const event of msgStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
      } catch (err: any) {
        controller.enqueue(encoder.encode(''))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } })
}
