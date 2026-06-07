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

const URL_MAP: Record<string, string[]> = {
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

export async function syncICalToDB(propertyId: string): Promise<number> {
  const urls = (URL_MAP[propertyId] || []).filter(Boolean)
  if (!urls.length) return 0

  const supabase = createAdminClient()
  let saved = 0

  await Promise.all(urls.map(async url => {
    const platform = detectPlatform(url)
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 RentalDirect/1.0' },
        cache: 'no-store',
      })
      if (!res.ok) return
      const text = await res.text()
      const events = parseICal(text)

      for (const event of events) {
        await supabase.from('calendar_blocks').upsert({
          property_id: propertyId,
          start_date: event.start,
          end_date: event.end,
          reason: 'manual',
          notes: `Synced from ${platform}`,
          platform,
        }, { onConflict: 'property_id,start_date' })
        saved++
      }
    } catch {}
  }))

  return saved
}
