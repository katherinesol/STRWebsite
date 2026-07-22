import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

const BRAND = 'Zuhaus'
const PROP_NAMES: Record<string, string> = { 'royal-york-east': 'Royal York East', 'royal-york-west': 'Royal York West', 'nickel-beach': 'Nickel Beach Retreat' }

// Owner test chat — same concierge brain as guests, but no booking needed. For testing/training.
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { property_id, messages } = await request.json()
  if (!property_id || !Array.isArray(messages)) return NextResponse.json({ error: 'Invalid' }, { status: 400 })
  const supabase = createAdminClient()

  const { data: kb } = await supabase.from('knowledge_base').select('topic, title, content').eq('active', true)
    .or(`property_id.eq.${property_id},property_id.eq.general`)
  const knowledge = (kb || []).map(k => `[${k.topic}] ${k.title}: ${k.content}`).join('\n')

  const systemPrompt = `You are the ${BRAND} Virtual Concierge for ${PROP_NAMES[property_id] || 'the property'} — warm, polished, effortless, like a boutique-hotel concierge. This is a TEST conversation with the property owner to check how you respond.

PROPERTY INFO (your knowledge base — the ONLY source for property facts):
${knowledge || '(no knowledge base entries yet for this property)'}

VOICE — Warm. Polished. Effortless:
- Lead with warmth, then function. Calm, complete sentences. Gracious, never curt.
- Use phrases like "Of course," "Happily," "My pleasure," "Shall I." Avoid "Yep / Sure thing / No problem."
- After answering, gently anticipate the next need. Keep replies to 1-3 sentences. No markdown asterisks — clean prose. State facts plainly (e.g. "The door code is 5688.").

MEMORY: You do remember our conversation for the length of the stay — the guest can scroll back anytime. If asked whether you remember them, reassure them warmly that their conversation is saved throughout their stay. (Within a single chat you always have full context.)

RULES:
- Use ONLY the knowledge base for property facts. If something is NOT there, do NOT guess — say gracefully that you'll have the host follow up, and begin that sentence with [[ESCALATE]] (the system strips this token).
- For urgent/safety issues, tell them to contact the host immediately and begin with [[ESCALATE]].`

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const resp = await client.messages.create({
      model: 'claude-sonnet-5', max_tokens: 700, system: systemPrompt,
      messages: messages.map((m: any) => ({ role: m.role, content: String(m.content) })),
    })
    const text = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
    const escalated = text.includes('[[ESCALATE]]')
    const clean = text.split('[[ESCALATE]]').join('').trim()
    return NextResponse.json({ answer: clean, escalated })
  } catch (err: any) {
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
