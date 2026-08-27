import { createAdminClient } from '@/lib/supabase/server'
import { logSystem } from '@/lib/system-log'
import { parseICal, detectPlatform } from '@/lib/ical-parse'

// Seam is imported lazily: it is only needed when a booking is cancelled or moved,
// so parsing a feed should not drag in the lock SDK.
const seamLib = () => import('@/lib/seam')

// The ONE way platform bookings enter calendar_blocks.
//
// This used to run on every load of /admin/calendar, which meant a page view could
// insert bookings, move dates, reprogram a lock and revoke a door code. It now runs
// from the daily cron and from an explicit Sync-now button — both through
// syncAllICal() below, so there is a single code path and a single set of rules.
//
// IDENTITY. A synced row is identified by its feed UID, not by its dates. Matching
// on (start_date, end_date) meant a manual date edit broke the link: the event no
// longer matched, a duplicate was inserted, and the reconcile pass then reverted the
// edit. UID survives a date change, so an edit stays an edit. Rows created before
// UIDs were captured have ical_uid null; they adopt one the first time a feed event
// matches them by range.

export type FeedResult = {
  property_id: string
  platform: string
  url_host: string
  ok: boolean
  events: number
  inserted: number
  adopted: number
  /** blank door codes filled from this feed's DESCRIPTION; always 0 for VRBO */
  codesFilled?: number
  error?: string
}

export type SyncReport = {
  properties: string[]
  feeds: FeedResult[]
  inserted: number
  adopted: number
  extended: number
  cancelled: number
  removed: number
  /** blank door codes filled from a feed this run */
  codesFilled?: number
  failed_feeds: number
}

const hostOf = (u: string) => { try { return new URL(u).hostname } catch { return u.slice(0, 24) } }

/** Sync every property that has an active feed. The property list comes from the
 *  ical_feeds table, so a property with no feed is never touched and a new one
 *  starts syncing the moment its feed row is added — no code change. */
export async function syncAllICal(): Promise<SyncReport> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('ical_feeds').select('property_id').eq('active', true)
  const properties = [...new Set((data || []).map((f: any) => f.property_id).filter(Boolean))]

  const report: SyncReport = {
    properties, feeds: [], inserted: 0, adopted: 0,
    extended: 0, cancelled: 0, removed: 0, codesFilled: 0, failed_feeds: 0,
  }
  for (const p of properties) {
    const r = await syncICalToDB(p)
    report.feeds.push(...r.feeds)
    report.inserted += r.inserted
    report.adopted += r.adopted
    report.extended += r.extended
    report.cancelled += r.cancelled
    report.removed += r.removed
    // merged like every other counter; without this the run-level total reads 0
    // while the per-feed rows show the real count, which is how a sweep looks
    // like it did nothing when it did something
    report.codesFilled = (report.codesFilled || 0) + (r.codesFilled || 0)
  }
  report.failed_feeds = report.feeds.filter(f => !f.ok).length
  return report
}

export async function syncICalToDB(propertyId: string): Promise<SyncReport> {
  const supabase = createAdminClient()
  const report: SyncReport = {
    properties: [propertyId], feeds: [], inserted: 0, adopted: 0,
    extended: 0, cancelled: 0, removed: 0, failed_feeds: 0,
  }

  const { data: feeds } = await supabase.from('ical_feeds').select('url').eq('property_id', propertyId).eq('active', true)
  const urls = (feeds || []).map((f: any) => f.url).filter(Boolean)
  if (!urls.length) return report

  // every range currently present per platform, plus start->end for extension detection
  const feedRangesByPlatform: Record<string, Set<string>> = {}
  const feedUidsByPlatform: Record<string, Set<string>> = {}
  const feedStartMap: Record<string, Record<string, string>> = {}

  for (const url of urls) {
    const platform = detectPlatform(url)
    const fr: FeedResult = { property_id: propertyId, platform, url_host: hostOf(url), ok: false, events: 0, inserted: 0, adopted: 0 }
    if (!feedRangesByPlatform[platform]) feedRangesByPlatform[platform] = new Set()
    if (!feedUidsByPlatform[platform]) feedUidsByPlatform[platform] = new Set()
    if (!feedStartMap[platform]) feedStartMap[platform] = {}

    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 RentalDirect/1.0' }, cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const events = parseICal(await res.text())
      fr.events = events.length

      for (const event of events) {
        feedRangesByPlatform[platform].add(`${event.start}|${event.end}`)
        feedStartMap[platform][event.start] = event.end
        if (event.uid) feedUidsByPlatform[platform].add(event.uid)

        // 1. match by UID — survives a manual date change
        let existing: any = null
        if (event.uid) {
          const { data } = await supabase.from('calendar_blocks')
            .select('id, start_date, end_date, ical_uid')
            .eq('property_id', propertyId).eq('ical_uid', event.uid).maybeSingle()
          existing = data
        }

        // 2. fall back to the date range, for rows created before UIDs were stored
        if (!existing) {
          const { data } = await supabase.from('calendar_blocks')
            .select('id, start_date, end_date, ical_uid')
            .eq('property_id', propertyId)
            .eq('start_date', event.start).eq('end_date', event.end)
            .is('ical_uid', null)
            .maybeSingle()
          if (data) {
            existing = data
            // adopt the UID so this row is never identified by its dates again
            if (event.uid) {
              const { error } = await supabase.from('calendar_blocks')
                .update({ ical_uid: event.uid }).eq('id', data.id).is('ical_uid', null)
              if (!error) { fr.adopted++; report.adopted++ }
            }
          }
        }

        /*  BACKFILL A BLANK CODE, AND ONLY A BLANK ONE.
         *
         *  Every door_code in this database was hand-copied off the platform,
         *  because this parser used to discard DESCRIPTION - so a booking nobody
         *  got to simply had none, and the cron would report "no code on
         *  booking" forever without ever creating one. Five were in that state.
         *
         *  NON-BLANK ALWAYS WINS. A code already set was typed by a person or
         *  corrected after the fact, and a guest may be holding it already.
         *  Overwriting from a feed would change a live code silently, and the
         *  failure mode is a guest at the door with a number that no longer
         *  opens it. So a filled code is never touched, and the
         *  .is('door_code', null) below is the second lock on that: even if the
         *  row changed between this read and this write, a non-null value cannot
         *  be replaced.
         *
         *  VRBO IS NOT COVERED and must not appear to be. Its feed carries no
         *  DESCRIPTION at all, so a VRBO booking stays blank and still needs its
         *  code read off the dashboard by hand. */
        if (existing && event.phoneLast4) {
          const { data: cur } = await supabase.from('calendar_blocks')
            .select('door_code').eq('id', existing.id).maybeSingle()
          if (cur && !String(cur.door_code || '').trim()) {
            const { error: cErr } = await supabase.from('calendar_blocks')
              .update({ door_code: event.phoneLast4 })
              .eq('id', existing.id).is('door_code', null)
            if (!cErr) {
              fr.codesFilled = (fr.codesFilled || 0) + 1
              report.codesFilled = (report.codesFilled || 0) + 1
              await logSystem('lock.code_from_feed',
                `Filled a blank door code from the ${platform} feed: ${event.phoneLast4} (${event.start}-${event.end})`,
                { booking_id: existing.id, code: event.phoneLast4, platform }, propertyId)
            }
          }
        }

        if (!existing) {
          const { error } = await supabase.from('calendar_blocks').insert({
            property_id: propertyId, start_date: event.start, end_date: event.end,
            reason: 'manual', notes: `Synced from ${platform}`, platform,
            ical_uid: event.uid || null,
            // the feed's phone-last-4 IS the door code; null on VRBO, which
            // publishes none at all
            door_code: event.phoneLast4 || null,
          })
          if (!error) { fr.inserted++; report.inserted++ }
        }
      }
      fr.ok = true
    } catch (e: any) {
      fr.error = e?.message || 'fetch failed'
    }
    report.feeds.push(fr)
  }

  // RECONCILE cancellations: synced blocks that vanished from their platform feed.
  // Only platforms that actually returned events are reconciled — a feed that errored
  // or came back empty must never be read as "everything was cancelled".
  const fetchedPlatforms = Object.keys(feedRangesByPlatform).filter(p => feedRangesByPlatform[p].size > 0)
  if (fetchedPlatforms.length) {
    const { data: synced } = await supabase.from('calendar_blocks')
      .select('id, platform, start_date, end_date, guest_name, door_code, notes, early_checkin_time, late_checkout_time, ical_uid')
      .eq('property_id', propertyId)
      // already cancelled: it has been through this once, and re-revoking its
      // code every sync would reach for a code that may since be someone else's
      .neq('status', 'cancelled')
      .in('platform', fetchedPlatforms)

    const todayStr = new Date().toISOString().split('T')[0]
    for (const b of synced || []) {
      if (b.end_date < todayStr) continue   // don't revoke a stay that already ended

      // Still present? By UID when we have one — a date change is then an EDIT, not a
      // disappearance, and the row is left exactly as the owner set it.
      if (b.ical_uid) {
        if (feedUidsByPlatform[b.platform]?.has(b.ical_uid)) continue
      } else if (feedRangesByPlatform[b.platform]?.has(`${b.start_date}|${b.end_date}`)) {
        continue
      }

      // Pre-UID rows only: same start, different end = the platform moved the dates.
      if (!b.ical_uid) {
        const newEnd = feedStartMap[b.platform]?.[b.start_date]
        if (newEnd && newEnd !== b.end_date) {
          await supabase.from('calendar_blocks').update({ end_date: newEnd }).eq('id', b.id)
          report.extended++
          const exCode = String(b.door_code || '').replace(/[^0-9]/g, '').slice(-4)
          if (exCode) {
            try {
              const { reprogramBookingWindow, windowFromBooking } = await seamLib()
              await reprogramBookingWindow({
                propertyId, platform: b.platform, code: exCode,
                startsAt: windowFromBooking(b.start_date, (b as any).early_checkin_time || null, false),
                endsAt: windowFromBooking(newEnd, (b as any).late_checkout_time || null, true),
              })
            } catch {}
          }
          const dir = newEnd > b.end_date ? 'extended' : 'shortened'
          await logSystem('booking.dates_changed', (b.guest_name || 'A booking') + ' ' + dir + ': ' + b.start_date + '–' + b.end_date + ' → ' + b.start_date + '–' + newEnd + '. Code window moved. REVIEW FINANCE (accommodation, tax, payout).', { booking_id: b.id, old_end: b.end_date, new_end: newEnd, code: exCode || null }, propertyId)
          continue
        }
      }

      // vanished from feed = likely cancelled. Revoke any code first (security).
      const code = String(b.door_code || '').replace(/\D/g, '').slice(-4)
      if (code) {
        const { revokeCodeFromProperty } = await seamLib()
        const r = await revokeCodeFromProperty(propertyId, code)
        await logSystem('lock.revoked', `Revoked code ${code} for cancelled ${b.platform} booking (${b.start_date}–${b.end_date})`, { code, revoked: r.revoked, booking_id: b.id }, propertyId)
      }

      /*  IT IS MARKED, NOT DELETED — and that is the stage 1 status column
          doing the job it was added for.

          This used to delete any row that had never been hand-edited, on the
          reasoning that a bare synced row holds nothing worth keeping. That was
          true when a synced row was only dates. It stopped being true the
          moment reconciliation put payouts, tax splits and confirmation codes on
          these rows: a feed that drops an event for a night — a platform
          outage, a re-issued UID, a fetch that half-succeeds — would take a
          reconciled booking's figures with it, permanently, with a log line as
          the only trace. A status change is recoverable; a delete is not.

          The enriched branch had the opposite problem: it logged loudly and
          changed nothing, so a cancelled booking kept its confirmed status and
          went on counting in every total. Both branches now do the same thing,
          and it is the thing stage 1 built the read paths for. */
      const pristine = !b.guest_name && !b.door_code
      const { error: cancelErr } = await supabase.from('calendar_blocks').update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: `Vanished from the ${b.platform} feed`,
      }).eq('id', b.id).neq('status', 'cancelled')

      if (cancelErr) {
        await logSystem('booking.cancel_failed', `${b.guest_name || 'A booking'} vanished from the ${b.platform} feed but could NOT be marked cancelled: ${cancelErr.message}. It is still counting as a live booking.`, { booking_id: b.id, error: cancelErr.message }, propertyId)
      } else if (pristine) {
        report.removed++
        await logSystem('booking.cancelled', `Marked a bare ${b.platform} booking cancelled (${b.start_date}–${b.end_date}) — it vanished from the feed and had never been edited. Kept, not deleted.`, { booking_id: b.id }, propertyId)
      } else {
        report.cancelled++
        await logSystem('booking.cancelled', `${b.guest_name || 'A booking'} vanished from the ${b.platform} feed — marked cancelled and the code revoked. Its figures are kept; review the record (${b.start_date}–${b.end_date}).`, { booking_id: b.id }, propertyId)
      }
    }
  }

  report.failed_feeds = report.feeds.filter(f => !f.ok).length
  return report
}
