import { NextRequest, NextResponse } from 'next/server'
import { getCisternLevel } from '@/lib/cistern'
import { backfillWind } from '@/lib/wind-log'
import { syncAllICal } from '@/lib/ical-sync'
import { createAdminClient } from '@/lib/supabase/server'
import { Seam } from 'seam'
import { reprogramBookingWindow, windowFromBooking } from '@/lib/seam'
import { classifyCode } from '@/lib/lock-code-status'
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
  results.lockSweep = { checked: 0, reprogrammed: 0, confirmed: 0, failures: [] as any[], pending: [] as any[] }
  try {
    const seam = process.env.SEAM_API_KEY ? new Seam({ apiKey: process.env.SEAM_API_KEY }) : null
    if (seam) {
      const sc = seam  // non-null binding for closures
      const now = Date.now()
      const horizon = new Date(now + 72 * 3600 * 1000).toISOString().split('T')[0]
      const todayStr = new Date(now).toISOString().split('T')[0]

      const { data: allLocks } = await supabase.from('property_locks').select('*').eq('active', true)
      const locksFor = (pid: string) => (allLocks || []).filter((l: any) => l.property_id === pid)
      const deviceCodes: Record<string, any[]> = {}
      async function codesOn(devId: string) {
        if (!deviceCodes[devId]) { try { deviceCodes[devId] = await sc.accessCodes.list({ device_id: devId }) } catch { deviceCodes[devId] = [] } }
        return deviceCodes[devId]
      }

      // platform bookings checking in within the window
      // WHAT COUNTS AS NEEDING A CODE. This asked `is_booking = true`, which is a
      // question about whether someone has finished entering a booking's money —
      // not about whether a guest is arriving. iCal inserts a reservation with
      // `reason: 'manual'` and no `is_booking`, so it defaults false: such a row
      // was not merely uncoded, it never reached the `if (!code)` branch either,
      // so it raised no "no code on booking" alert. Silence, for a real arrival.
      //
      // `ical_uid` is the honest marker of a platform reservation, because
      // parseICal already drops "not available" / "unavailable" / "blocked"
      // events — so a row carrying a feed UID is a stay, never an owner block.
      // In-app owner blocks have no UID and no is_booking, and stay excluded.
      const { data: plat } = await supabase.from('calendar_blocks')
        .select('id, property_id, platform, start_date, end_date, early_checkin_time, late_checkout_time, door_code, guest_name')
        // never program a door code for a stay that was cancelled
        .neq('status', 'cancelled')
        .or('is_booking.eq.true,ical_uid.not.is.null')
        .gte('start_date', todayStr).lte('start_date', horizon)

      for (const b of plat || []) {
        const isAirbnb = b.platform === 'airbnb'
        const code = String(b.door_code || '').replace(/\D/g, '').slice(-4)
        if (!code) { results.lockSweep.failures.push({ guest: b.guest_name, property: b.property_id, start: b.start_date, issue: 'no code on booking' }); continue }
        results.lockSweep.checked++
        const hrsUntilStart = (new Date(b.start_date + 'T16:00:00Z').getTime() - now) / 3600000
        const shouldBeReady = hrsUntilStart < 48

        for (const lock of locksFor(b.property_id)) {
          if (isAirbnb && lock.airbnb_managed) continue
          const codes = await codesOn(lock.seam_device_id)
          const match = codes.find((x: any) => x.code === code)
          const healthy = match && (match.status === 'set' || match.is_scheduled_on_device)
          if (!healthy && shouldBeReady) {
            // re-program this booking's window (creates or updates)
            try {
              await reprogramBookingWindow({
                propertyId: b.property_id, platform: b.platform || 'direct', code,
                startsAt: windowFromBooking(b.start_date, b.early_checkin_time, false),
                endsAt: windowFromBooking(b.end_date, b.late_checkout_time, true),
              })
              results.lockSweep.reprogrammed++
              deviceCodes[lock.seam_device_id] = await sc.accessCodes.list({ device_id: lock.seam_device_id })
              const recheck = deviceCodes[lock.seam_device_id].find((x: any) => x.code === code)

              // SEAM CONFIRMS ASYNCHRONOUSLY, so the old check here could not
              // succeed. A code created seconds ago reads status 'unset' with
              // is_scheduled_on_device false, and a future-dated code cannot
              // report 'set' at all until its window opens. Demanding
              // set-or-scheduled immediately after creating it therefore emailed
              // a failure for every advance booking the sweep programmed
              // correctly — two arrived for one booking that was perfectly fine.
              // An alert that always fires is one that stops being read, which
              // is exactly how a real failure gets through.
              //
              // So classify rather than demand confirmation. Only the genuinely
              // wrong states alert; a code still settling is recorded as pending
              // and re-checked by the next morning's run. Pending still escalates
              // to a failure once there is no runway left before check-in, so a
              // code that never lands is not quietly tolerated forever.
              const who = { guest: b.guest_name, property: b.property_id, lock: lock.lock_name, start: b.start_date }
              const verdict = classifyCode(recheck, hrsUntilStart, PENDING_GRACE_HOURS)
              if (verdict.outcome === 'failed') results.lockSweep.failures.push({ ...who, issue: verdict.issue })
              else if (verdict.outcome === 'pending') results.lockSweep.pending.push({ ...who, hours_until_checkin: Math.round(hrsUntilStart), note: 'created, waiting on Seam to confirm' })
              else results.lockSweep.confirmed++
            } catch (e: any) {
              results.lockSweep.failures.push({ guest: b.guest_name, lock: lock.lock_name, start: b.start_date, issue: e?.message || 'reprogram error' })
            }
          }
        }
      }

      // email host if anything failed
      if (results.lockSweep.failures.length && process.env.HOST_ALERT_EMAIL && process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY)
        const lines = results.lockSweep.failures.map((f: any) => `• ${f.guest || 'Guest'} (${f.property}${f.lock ? ' · ' + f.lock : ''}) checks in ${f.start} — ${f.issue}`).join('\n')
        await resend.emails.send({
          from: process.env.RESEND_FROM || 'alerts@rental-direct.com',
          to: process.env.HOST_ALERT_EMAIL,
          subject: `⚠ Lock codes need attention (${results.lockSweep.failures.length})`,
          text: `The morning lock check found codes that could not be confirmed:\n\n${lines}\n\nCheck the Locks dashboard to resolve before check-in.`,
        })
        results.lockSweep.emailed = true
      }
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
