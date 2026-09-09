import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

function parseICal(icalText: string): { start: string; end: string }[] {
  const events: { start: string; end: string }[] = []
  const lines = icalText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  let inEvent = false
  let start = ''
  let end = ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === 'BEGIN:VEVENT') { inEvent = true; start = ''; end = '' }
    if (trimmed === 'END:VEVENT') {
      if (start && end) events.push({ start, end })
      inEvent = false
    }
    if (inEvent) {
      if (trimmed.startsWith('DTSTART')) {
        const raw = trimmed.split(':').pop() || ''
        const digits = raw.replace(/\D/g, '').slice(0, 8)
        if (digits.length === 8) start = `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`
      }
      if (trimmed.startsWith('DTEND')) {
        const raw = trimmed.split(':').pop() || ''
        const digits = raw.replace(/\D/g, '').slice(0, 8)
        if (digits.length === 8) end = `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`
      }
    }
  }
  return events
}

function detectPlatform(url: string): string {
  if (url.includes('airbnb')) return 'airbnb'
  if (url.includes('vrbo') || url.includes('homeaway')) return 'vrbo'
  if (url.includes('houfy')) return 'houfy'
  return 'manual'
}

async function fetchFeed(url: string): Promise<{ start: string; end: string; platform: string }[]> {
  const platform = detectPlatform(url)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 RentalDirect/1.0' },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const text = await res.text()
    return parseICal(text).map(e => ({ ...e, platform }))
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const propertyId = searchParams.get('property')
  if (!propertyId) return NextResponse.json({ error: 'Missing property' }, { status: 400 })

  /*  FEEDS COME FROM ical_feeds, NOT FROM ENVIRONMENT VARIABLES.
   *
   *  This used to read a hardcoded urlMap of NICKEL_BEACH_* / ROYAL_YORK_*_ICAL
   *  vars. Only the three NICKEL_BEACH ones were ever set in production, so every
   *  other property returned an EMPTY calendar — a public availability endpoint
   *  reporting a fully-open suite that in fact had five confirmed Airbnb stays in
   *  the next month, the first arriving the following day. The note left below
   *  already recorded that Royal York West's var "was never set in production";
   *  the map stayed anyway, so the bug outlived its own documentation.
   *
   *  ical_feeds is what lib/ical-sync.ts reads, so availability and the synced
   *  calendar_blocks now agree by construction instead of by two people
   *  remembering to update two places. A feed added to the table works
   *  immediately, with no redeploy and no new secret.
   *
   *  The URLs never leave the server: the response carries start/end only, so a
   *  private calendarexport token cannot reach a public page through here. */
  const supabase = createAdminClient()
  const { data: feeds } = await supabase
    .from('ical_feeds')
    .select('url')
    .eq('property_id', propertyId)
    .eq('active', true)

  const urls = (feeds || []).map(f => f.url).filter(Boolean) as string[]
  const results = await Promise.all(urls.map(fetchFeed))
  const blocked = results.flat()

  // deduplicate by date range
  const seen = new Set<string>()
  const unique = blocked.filter(e => {
    const key = `${e.start}|${e.end}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // READ-ONLY. This endpoint used to write calendar_blocks via ?save=1, using feed
  // URLs from environment variables and an upsert keyed on (property_id, start_date)
  // — a second, divergent sync that could not reconcile cancellations and whose
  // Royal York West env var was never set in production. Rows now enter the database
  // through lib/ical-sync.ts only: the daily cron, or POST /api/admin/ical/sync.

  return NextResponse.json({
    blocked: unique.map(e => ({ start: e.start, end: e.end })),
    count: unique.length,
  })
}
