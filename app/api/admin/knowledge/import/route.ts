import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { hasRole } from '@/lib/auth'

const TOPICS = ['check-in', 'wifi', 'amenities', 'rules', 'local', 'troubleshooting', 'emergency', 'general']

export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { text } = await request.json()
  if (!text || text.trim().length < 20) return NextResponse.json({ error: 'Paste your house manual text' }, { status: 400 })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `Split this house manual into individual knowledge entries for a guest assistant. Return ONLY valid JSON, no markdown, no preamble:
{"entries": [{"topic": "one of: ${TOPICS.join(', ')}", "title": "short title", "content": "the info, cleaned up"}]}

Rules:
- Break the manual into logical, self-contained entries (one topic each — wifi separate from check-in, etc.).
- "title" is a short label (e.g. "Wifi", "Check-in time", "Hot tub", "Parking").
- "content" is the actual info a guest needs, lightly cleaned but keeping all specifics (passwords, codes, times, names).
- Pick the closest topic for each entry.
- Don't invent anything — only use what's in the manual.

House manual:
${text}`,
      }],
    })
    const textBlock = msg.content.find((b: any) => b.type === 'text')
    const raw = (textBlock && 'text' in textBlock ? textBlock.text : '{}') || '{}'
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return NextResponse.json({ ok: true, entries: parsed.entries || [] })
  } catch (err: any) {
    return NextResponse.json({ error: 'Could not parse manual: ' + (err?.message || 'unknown') }, { status: 500 })
  }
}
