import { createAdminClient } from '@/lib/supabase/server'
import { revokeCodeFromProperty } from '@/lib/seam'
import { logSystem } from '@/lib/system-log'

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
      // skip Airbnb/VRBO "not available" and owner-blocked events — they are NOT bookings
      const s = summary.toLowerCase()
      const isBlockMarker = s.includes('not available') || s.includes('unavailable') || s.includes('blocked')
      if (start && end && !isBlockMarker) events.push({ start, end, summary })
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

  // collect every date-range currently present across all feeds, keyed by platform
  const feedRanges = new Set<string>()          // "platform|start|end"
  const feedRangesByPlatform: Record<string, Set<string>> = {}

  await Promise.all(urls.map(async url => {
    const platform = detectPlatform(url)
    if (!feedRangesByPlatform[platform]) feedRangesByPlatform[platform] = new Set()
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 RentalDirect/1.0' }, cache: 'no-store' })
      if (!res.ok) return
      const text = await res.text()
      const events = parseICal(text)
      for (const event of events) {
        feedRanges.add(`${platform}|${event.start}|${event.end}`)
        feedRangesByPlatform[platform].add(`${event.start}|${event.end}`)
        const { data: existing } = await supabase
          .from('calendar_blocks')
          .select('id, guest_name')
          .eq('property_id', propertyId)
          .eq('start_date', event.start)
          .eq('end_date', event.end)
          .maybeSingle()
        if (!existing) {
          await supabase.from('calendar_blocks').insert({
            property_id: propertyId, start_date: event.start, end_date: event.end,
            reason: 'manual', notes: `Synced from ${platform}`, platform,
          }).then(({ error }) => { if (!error) saved++ })
        }
      }
    } catch {}
  }))

  // RECONCILE cancellations: synced blocks whose range vanished from their platform feed.
  // Only reconcile platforms we actually fetched (don't touch a platform whose feed errored/empty).
  const fetchedPlatforms = Object.keys(feedRangesByPlatform).filter(p => feedRangesByPlatform[p].size > 0)
  if (fetchedPlatforms.length) {
    const { data: synced } = await supabase.from('calendar_blocks')
      .select('id, platform, start_date, end_date, guest_name, door_code, notes')
      .eq('property_id', propertyId)
      .in('platform', fetchedPlatforms)

    const todayStr = new Date().toISOString().split('T')[0]
    for (const b of synced || []) {
      // skip past bookings — no point revoking a stay that already ended
      if (b.end_date < todayStr) continue
      const key = `${b.start_date}|${b.end_date}`
      const stillInFeed = feedRangesByPlatform[b.platform]?.has(key)
      if (stillInFeed) continue

      // vanished from feed = likely cancelled. Revoke any code first (security).
      const code = String(b.door_code || '').replace(/\D/g, '').slice(-4)
      if (code) {
        const r = await revokeCodeFromProperty(propertyId, code)
        await logSystem('lock.revoked', `Revoked code ${code} for cancelled ${b.platform} booking (${b.start_date}–${b.end_date})`, { code, revoked: r.revoked, booking_id: b.id }, propertyId)
      }

      // pristine (never manually touched) => safe to remove. Enriched => keep + flag.
      const pristine = !b.guest_name && !b.door_code
      if (pristine) {
        await supabase.from('calendar_blocks').delete().eq('id', b.id)
        await logSystem('booking.removed', `Removed cancelled ${b.platform} booking (${b.start_date}–${b.end_date}) — was never manually edited`, { booking_id: b.id }, propertyId)
      } else {
        await logSystem('booking.cancelled', `${b.guest_name || 'A booking'} vanished from ${b.platform} feed — code revoked, review the record (${b.start_date}–${b.end_date})`, { booking_id: b.id }, propertyId)
      }
    }
  }

  return saved
}
