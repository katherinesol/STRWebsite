import { NextRequest, NextResponse } from 'next/server'

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

  const urlMap: Record<string, string[]> = {
    'nickel-beach': [
      process.env.NICKEL_BEACH_AIRBNB_ICAL || '',
      process.env.NICKEL_BEACH_VRBO_ICAL || '',
      process.env.NICKEL_BEACH_HOUFY_ICAL || '',
    ],
    'royal-york-east': [
      process.env.ROYAL_YORK_EAST_AIRBNB_ICAL || '',
      process.env.ROYAL_YORK_EAST_VRBO_ICAL || '',
      process.env.ROYAL_YORK_EAST_HOUFY_ICAL || '',
    ],
    'royal-york-west': [
      process.env.ROYAL_YORK_WEST_AIRBNB_ICAL || '',
      process.env.ROYAL_YORK_WEST_VRBO_ICAL || '',
      process.env.ROYAL_YORK_WEST_HOUFY_ICAL || '',
    ],
  }

  const urls = (urlMap[propertyId] || []).filter(Boolean)
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

  // save to calendar_blocks when requested
  const save = searchParams.get('save')
  if (save === '1' && unique.length > 0) {
    const { createAdminClient } = await import('@/lib/supabase/server')
    const supabase = createAdminClient()
    for (const event of unique) {
      await supabase.from('calendar_blocks').upsert({
        property_id: propertyId,
        start_date: event.start,
        end_date: event.end,
        reason: 'manual',
        notes: `Synced from ${event.platform}`,
        platform: event.platform,
      }, { onConflict: 'property_id,start_date' })
    }
  }

  return NextResponse.json({
    blocked: unique.map(e => ({ start: e.start, end: e.end })),
    count: unique.length,
  })
}
