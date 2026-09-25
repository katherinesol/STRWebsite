import { NextRequest, NextResponse } from 'next/server'
import { getCisternLevel } from '@/lib/cistern'
import { backfillWind } from '@/lib/wind-log'
import { syncAllICal } from '@/lib/ical-sync'
import { createAdminClient } from '@/lib/supabase/server'
import { windowFromBooking } from '@/lib/lock-window'
import { queueForBooking } from '@/lib/lock-queue'
import { Resend } from 'resend'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const results: any = { cistern: null, waterTask: null, lockTasks: [] }

  // 1. Cistern reading + store
  const reading = await getCisternLevel(true)
  results.cistern = reading?.percent ?? null

  // 1b. Wind log — backfill the last 2 days of hourly readings for Nickel Beach.
  // Hobby plan caps crons at once daily, so a single live sample would be useless
  // as damage evidence; hourly history from Open-Meteo fills the gap. Idempotent.
  try {
    results.windLog = await backfillWind('nickel-beach', 2)
  } catch (e: any) {
    results.windLog = { error: e?.message }
  }

  // 1c. iCal sync — the ONLY scheduled path for platform bookings into the DB.
  // This used to run on every load of /admin/calendar, so a page view could insert
  // bookings, move dates and revoke door codes. Wrapped so a dead feed cannot take
  // down the lock sweep below.
  try {
    results.icalSync = await syncAllICal()
  } catch (e: any) {
    results.icalSync = { error: e?.message }
  }

  // 2. Low-water → create "order water" task if at/below reorder threshold and none open
  try {
    const { data: cal } = await supabase.from('cistern_calibration').select('reorder_threshold').eq('id', 'default').maybeSingle()
    const reorder = Number(cal?.reorder_threshold ?? 30)
    if (reading?.percent != null && reading.percent <= reorder) {
      // find an existing "order water" task
      const { data: existing } = await supabase
        .from('maintenance_tasks')
        .select('id')
        .eq('property_id', 'nickel-beach')
        .eq('title', 'Order water delivery')
        .eq('active', true)
        .maybeSingle()

      let taskId = existing?.id
      if (!taskId) {
        const { data: created } = await supabase.from('maintenance_tasks').insert({
          title: 'Order water delivery',
          description: `Cistern at ${reading.percent}% — at or below reorder level (${reorder}%).`,
          property_id: 'nickel-beach',
          type: 'maintenance',
          cadence: 'as-needed',
          priority: 'urgent',
        }).select('id').single()
        taskId = created?.id
        results.waterTask = 'created'
      } else {
        // task exists — check if it's been completed since it was last relevant; if open, leave it
        const { data: lastComp } = await supabase
          .from('task_completions')
          .select('completed_at')
          .eq('task_id', taskId)
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        // if it was completed (water was ordered) but level is low again, reactivate by noting
        results.waterTask = lastComp ? 'exists-completed' : 'exists-open'
      }
    }
  } catch (e: any) {
    results.waterError = e?.message
  }

  // 3. Lock sweep — verify codes are set-or-scheduled for check-ins within 72h;
  //    re-program gaps; email host about anything that still won't confirm.
  // How close to check-in a code may still be unconfirmed before it counts as a
  // failure rather than as settling. Inside this window there is no runway left,
  // so an unconfirmed code is worth waking someone for.
  const PENDING_GRACE_HOURS = 12
  results.lockSweep = { checked: 0, queued: 0, confirmed: 0, failures: [] as any[], pending: [] as any[] }
  try {
    /*  THE MORNING CHECK, THROUGH THE QUEUE.
     *
     *  This used to call reprogramBookingWindow — a Seam write — then re-list
     *  the device to confirm it. Both halves are gone: the Seam account answers
     *  401 outbound and stopped delivering inbound on 23 September, so what
     *  remained was a job that reported a failure for every upcoming stay
     *  because it could not read a lock, and attempted writes that reached
     *  nothing. It escalated rather than claiming success, which is the safe
     *  direction to be broken in, but it was still broken.
     *
     *  The queue is what programs a door now, and the local worker drains it.
     *  So this asks a different question: does every upcoming stay HAVE an
     *  intent, and are those intents landing? An absent intent is queued. One
     *  that has failed, or is still waiting with no runway left, is escalated
     *  by email exactly as before.
     *
     *  IT DOES NOT TOUCH lock_status. The worker owns that column — it reads
     *  the hardware — and a second writer inferring state from the queue is how
     *  a device reading gets overwritten with a weaker claim. */
    const now = Date.now()
    const horizon = new Date(now + 72 * 3600 * 1000).toISOString().split('T')[0]
    const todayStr = new Date(now).toISOString().split('T')[0]

    const { data: allLocks } = await supabase.from('property_locks')
      .select('id, property_id, lock_name, airbnb_managed').eq('active', true)
    const locksFor = (pid: string) => (allLocks || []).filter((l: any) => l.property_id === pid)

    const { data: plat } = await supabase.from('calendar_blocks')
      .select('id, property_id, platform, start_date, end_date, door_code, guest_name, early_checkin_time, late_checkout_time')
      .neq('status', 'cancelled')
      .or('is_booking.eq.true,ical_uid.not.is.null')
      .gte('start_date', todayStr).lte('start_date', horizon)

    const ids = (plat || []).map((b: any) => b.id)
    const { data: acts } = ids.length
      ? await supabase.from('lock_actions')
          .select('booking_id, lock_id, status, last_error, created_at')
          .in('booking_id', ids).order('created_at', { ascending: false })
      : { data: [] as any[] }
    const latest: Record<string, any> = {}
    for (const a of acts || []) {
      const k = `${a.booking_id}|${a.lock_id}`
      if (!(k in latest)) latest[k] = a
    }

    for (const b of plat || []) {
      const isAirbnb = b.platform === 'airbnb'
      const code = String(b.door_code || '').replace(/\D/g, '').slice(-4)
      if (!code) {
        results.lockSweep.failures.push({ guest: b.guest_name, property: b.property_id, start: b.start_date, issue: 'no code on booking' })
        continue
      }
      results.lockSweep.checked++
      const hrsUntilStart = (new Date(b.start_date + 'T16:00:00Z').getTime() - now) / 3600000
      const who = { guest: b.guest_name, property: b.property_id, start: b.start_date }

      /*  Airbnb-managed doors are skipped by queueForBooking for Airbnb stays,
          so they are skipped here too — expecting an intent that the rule
          deliberately never creates would report a fault on every one. */
      const ourLocks = locksFor(b.property_id).filter((l: any) => !(isAirbnb && l.airbnb_managed))
      if (!ourLocks.length) continue

      const missing = ourLocks.filter((l: any) => !latest[`${b.id}|${l.id}`])
      if (missing.length) {
        const q = await queueForBooking({
          bookingId: b.id, bookingKind: 'platform', propertyId: b.property_id,
          platform: b.platform, action: 'program', code,
          startsAt: windowFromBooking(b.start_date, b.early_checkin_time, false),
          endsAt: windowFromBooking(b.end_date, b.late_checkout_time, true),
          who: `${b.guest_name || 'Guest'} · ${b.start_date} · queued by the morning check`,
        })
        results.lockSweep.queued += q.queued.length
        if (!q.ok) results.lockSweep.failures.push({ ...who, issue: `could not be queued: ${q.failed.map(f => f.error).join('; ')}` })
      }

      for (const l of ourLocks) {
        const a = latest[`${b.id}|${l.id}`]
        if (!a) continue                                   // just queued above
        if (a.status === 'done') { results.lockSweep.confirmed++; continue }
        if (a.status === 'failed') {
          results.lockSweep.failures.push({ ...who, lock: l.lock_name, issue: a.last_error || 'the worker could not program this door' })
          continue
        }
        /*  Still waiting. Inside the grace window there is no runway left
            before check-in, so an undrained intent is worth waking someone for;
            outside it, the worker simply has not got to it yet, and the pacing
            that makes Royal Side reliable is not a fault. */
        if (hrsUntilStart < PENDING_GRACE_HOURS) {
          results.lockSweep.failures.push({ ...who, lock: l.lock_name, issue: `still queued with ${Math.round(hrsUntilStart)}h until check-in — the worker has not programmed it` })
        } else {
          results.lockSweep.pending.push({ ...who, lock: l.lock_name, hours_until_checkin: Math.round(hrsUntilStart), note: 'queued, waiting for the worker' })
        }
      }
    }

    if (results.lockSweep.failures.length && process.env.HOST_ALERT_EMAIL && process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const lines = results.lockSweep.failures.map((f: any) => `• ${f.guest || 'Guest'} (${f.property}${f.lock ? ' · ' + f.lock : ''}) checks in ${f.start} — ${f.issue}`).join('\n')
      await resend.emails.send({
        from: process.env.RESEND_FROM || 'alerts@rental-direct.com',
        to: process.env.HOST_ALERT_EMAIL,
        subject: `⚠ Lock codes need attention (${results.lockSweep.failures.length})`,
        text: `The morning lock check found codes that are not on their doors:\n\n${lines}\n\nOpen Locks to resolve before check-in.`,
      })
      results.lockSweep.emailed = true
    }
  } catch (e: any) {
    results.lockError = e?.message
  }

  // 4. Toronto MAT filing reminders — 14 days before each deadline, per property (East + West file separately).
  //    Deadlines: Apr 30 (Q1), Jul 30 (Q2), Oct 30 (Q3), Jan 30 (Q4 prior year). File even at zero.
  results.matReminders = []
  try {
    const now = new Date()
    const y = now.getUTCFullYear()
    // deadline definitions: [month(0-idx), day, quarter label, quarter's year offset]
    const deadlines = [
      { m: 3, d: 30, q: 'Q1', qYear: y },        // Apr 30 -> Q1 this year
      { m: 6, d: 30, q: 'Q2', qYear: y },        // Jul 30 -> Q2 this year
      { m: 9, d: 30, q: 'Q3', qYear: y },        // Oct 30 -> Q3 this year
      { m: 0, d: 30, q: 'Q4', qYear: y - 1 },    // Jan 30 -> Q4 prior year
    ]
    for (const dl of deadlines) {
      const deadlineDate = new Date(Date.UTC(y, dl.m, dl.d))
      const daysUntil = Math.round((deadlineDate.getTime() - now.getTime()) / 86400000)
      if (daysUntil < 0 || daysUntil > 14) continue   // only within the 14-day window
      for (const prop of ['royal-york-east', 'royal-york-west']) {
        const propName = prop === 'royal-york-east' ? 'Royal York East' : 'Royal York West'
        const title = `File Toronto MAT — ${dl.q} ${dl.qYear} — ${propName}`
        const { data: existing } = await supabase.from('maintenance_tasks')
          .select('id').eq('property_id', prop).eq('title', title).maybeSingle()
        if (!existing) {
          await supabase.from('maintenance_tasks').insert({
            title,
            description: `Toronto MAT report for ${dl.q} ${dl.qYear} is due ${deadlineDate.toISOString().split('T')[0]}. File even if zero. Record the confirmation in Toronto MAT.`,
            property_id: prop,
            type: 'admin',
            cadence: 'one-time',
            priority: 'urgent',
            due_date: deadlineDate.toISOString().split('T')[0],
          })
          results.matReminders.push(title)
        }
      }
    }
  } catch (e: any) {
    results.matError = e?.message
  }

  return NextResponse.json({ ok: true, ...results })
}
