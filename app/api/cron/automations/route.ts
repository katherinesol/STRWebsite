import { NextRequest, NextResponse } from 'next/server'
import { getCisternLevel } from '@/lib/cistern'
import { createAdminClient } from '@/lib/supabase/server'
import { Seam } from 'seam'
import { reprogramBookingWindow, windowFromBooking } from '@/lib/seam'
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
  results.lockSweep = { checked: 0, reprogrammed: 0, failures: [] as any[] }
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
      const { data: plat } = await supabase.from('calendar_blocks')
        .select('id, property_id, platform, start_date, end_date, early_checkin_time, late_checkout_time, door_code, guest_name')
        .eq('is_booking', true).gte('start_date', todayStr).lte('start_date', horizon)

      for (const b of plat || []) {
        const isAirbnb = b.platform === 'airbnb'
        if (isAirbnb && b.property_id === 'nickel-beach') continue
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
              if (!recheck || (recheck.status !== 'set' && !recheck.is_scheduled_on_device)) {
                results.lockSweep.failures.push({ guest: b.guest_name, property: b.property_id, lock: lock.lock_name, start: b.start_date, issue: 'still not confirmed after reprogram' })
              }
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
