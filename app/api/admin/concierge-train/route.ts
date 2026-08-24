import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

const TOPICS = ['check-in', 'wifi', 'amenities', 'rules', 'local', 'troubleshooting', 'emergency', 'general']

/* owner + co-owner, matching every other knowledge route. Teach is the primary
   action on the concierge page and writes through here; leaving it owner-only
   would mean a co-owner can edit an entry but not create one from the question
   that just failed — the same inconsistency, on a different route. */
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { property_id, question, rough_answer } = await request.json()
  if (!property_id || !rough_answer?.trim()) return NextResponse.json({ error: 'Need property and answer' }, { status: 400 })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  try {
    // Only classify + title. Do NOT reword the host's answer — keep it as written.
    const msg = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `A rental host is saving an answer for their guest concierge. Give it a topic and a short title. Return ONLY JSON:
{"topic": "one of: ${TOPICS.join(', ')}", "title": "short label, e.g. 'Mattresses', 'Wifi', 'Parking'"}

The answer being saved: ${rough_answer}
Guest question for context: ${question || '(none)'}`,
      }],
    })
    const tb = msg.content.find((b: any) => b.type === 'text')
    const raw = (tb && 'text' in tb ? tb.text : '{}') || '{}'
    const meta = JSON.parse(raw.replace(/```json|```/g, '').trim())
    const title = meta.title || 'Info'
    const topic = meta.topic || 'general'
    const content = rough_answer.trim()  // saved exactly as the host wrote it

    const supabase = createAdminClient()

    // update an existing entry with the same title for this property, rather than adding a duplicate
    const { data: existing } = await supabase.from('knowledge_base')
      .select('id').eq('property_id', property_id).ilike('title', title).maybeSingle()

    let data, error
    if (existing) {
      ({ data, error } = await supabase.from('knowledge_base')
        .update({ topic, title, content, active: true, updated_at: new Date().toISOString() })
        .eq('id', existing.id).select('id, topic, title, content').single())
    } else {
      ({ data, error } = await supabase.from('knowledge_base')
        .insert({ property_id, topic, title, content, active: true })
        .select('id, topic, title, content').single())
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, entry: data, updated: !!existing })
  } catch (err: any) {
    return NextResponse.json({ error: 'Could not save: ' + (err?.message || 'unknown') }, { status: 500 })
  }
}
