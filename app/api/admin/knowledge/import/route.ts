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
      max_tokens: 8000,
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

    let entries: any[] = []
    try {
      entries = JSON.parse(clean).entries || []
    } catch {
      // salvage: response was likely truncated. Extract complete {topic,title,content} objects.
      const matches = clean.match(/\{[^{}]*"topic"[^{}]*"title"[^{}]*"content"[^{}]*\}/g) || []
      for (const m of matches) {
        try { entries.push(JSON.parse(m)) } catch {}
      }
      if (!entries.length) {
        return NextResponse.json({ error: 'The manual was too long to process at once. Try pasting it in two or three sections (e.g. access & wifi, then amenities, then local tips).' }, { status: 500 })
      }
    }
    return NextResponse.json({ ok: true, entries })
  } catch (err: any) {
    return NextResponse.json({ error: 'Could not parse manual: ' + (err?.message || 'unknown') }, { status: 500 })
  }
}
