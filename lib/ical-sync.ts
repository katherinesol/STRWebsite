import { createAdminClient } from '@/lib/supabase/server'

function parseICal(icalText: string): { start: string; end: string; summary: string }[] {
  const events: { start: string; end: string; summary: string }[] = []
  const lines = icalText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  let inEvent = false
  let start = ''
  let end = ''
  let summary = ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === 'BEGIN:VEVENT') { inEvent = true; start = ''; end = ''; summary = '' }
    if (trimmed === 'END:VEVENT') {
      if (start && end) events.push({ start, end, summary })
      inEvent = false
    }
    if (inEvent) {
      if (trimmed.startsWith('SUMMARY')) {
        summary = trimmed.split(':').slice(1).join(':').trim()
      }
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


export async function syncICalToDB(propertyId: string): Promise<number> {
  const supabase = createAdminClient()
  const { data: feeds } = await supabase.from('ical_feeds').select('url').eq('property_id', propertyId).eq('active', true)
  const urls = (feeds || []).map((f: any) => f.url).filter(Boolean)
  if (!urls.length) return 0

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
        // only insert if this exact date range doesn't exist yet
        // NEVER update existing records — guest data may have been manually added
        const { data: existing } = await supabase
          .from('calendar_blocks')
          .select('id, guest_name')
          .eq('property_id', propertyId)
          .eq('start_date', event.start)
          .eq('end_date', event.end)
          .maybeSingle()

        if (!existing) {
          await supabase.from('calendar_blocks').insert({
            property_id: propertyId,
            start_date: event.start,
            end_date: event.end,
            reason: 'manual',
            notes: `Synced from ${platform}`,
            platform,
          }).then(({ error }) => {
            if (!error) saved++
          })
        }
      }
    } catch {}
  }))

  return saved
}
