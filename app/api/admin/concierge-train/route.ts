import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

const TOPICS = ['check-in', 'wifi', 'amenities', 'rules', 'local', 'troubleshooting', 'emergency', 'general']

// Takes the owner's rough correction, polishes it into a clean concierge knowledge entry, saves it.
export async function POST(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { property_id, question, rough_answer } = await request.json()
  if (!property_id || !rough_answer?.trim()) return NextResponse.json({ error: 'Need property and answer' }, { status: 400 })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `A short-term rental host is teaching their guest concierge how to answer a question. Turn their rough notes into ONE clean knowledge base entry. Return ONLY valid JSON, no markdown:
{"topic": "one of: ${TOPICS.join(', ')}", "title": "short label (e.g. 'Windows', 'Wifi', 'Parking')", "content": "clear, complete, guest-friendly wording of the info — keep every specific detail, but phrase it cleanly and warmly"}

Guest question (for context): ${question || '(general info)'}
Host's rough notes: ${rough_answer}

Keep all specifics (steps, directions, codes, names). Don't invent anything not in the notes. Make the content clear enough that the concierge can answer confidently.`,
      }],
    })
    const tb = msg.content.find((b: any) => b.type === 'text')
    const raw = (tb && 'text' in tb ? tb.text : '{}') || '{}'
    const entry = JSON.parse(raw.replace(/```json|```/g, '').trim())

    // save it
    const supabase = createAdminClient()
    const { data, error } = await supabase.from('knowledge_base').insert({
      property_id, topic: entry.topic || 'general', title: entry.title || 'Info', content: entry.content, active: true,
    }).select('id, topic, title, content, created_at').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, entry: data })
  } catch (err: any) {
    return NextResponse.json({ error: 'Could not save: ' + (err?.message || 'unknown') }, { status: 500 })
  }
}
