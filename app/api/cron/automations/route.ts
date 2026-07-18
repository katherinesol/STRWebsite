import { NextResponse } from 'next/server'
import { getCisternLevel } from '@/lib/cistern'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
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

  // 3. Check-ins 3 days out → "Add [last4] to Schlage lock" task per booking
  try {
    const target = new Date()
    target.setDate(target.getDate() + 3)
    const targetDate = target.toISOString().split('T')[0]

    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, property_id, check_in, lock_code, guest_id, guests:guest_id(name, phone)')
      .eq('check_in', targetDate)

    for (const b of bookings || []) {
      const guest = (b.guests as any) || {}
      const phone = (guest.phone || '').replace(/\D/g, '')
      const last4 = phone.length >= 4 ? phone.slice(-4) : null
      // priority: phone last4 → manually entered lock_code → ask to retrieve
      const code = last4 || (b.lock_code ? String(b.lock_code).replace(/\D/g, '').slice(-4) : null)
      const title = code
        ? `Add ${code} to Schlage lock — ${guest.name || 'guest'} checks in ${b.check_in}`
        : `Retrieve lock code from platform + add to Schlage — ${guest.name || 'guest'} checks in ${b.check_in}`

      // dedupe: one lock task per booking (match on title containing booking check-in + guest)
      const { data: existing } = await supabase
        .from('maintenance_tasks')
        .select('id')
        .eq('property_id', b.property_id)
        .eq('title', title)
        .maybeSingle()

      if (!existing) {
        await supabase.from('maintenance_tasks').insert({
          title,
          property_id: b.property_id,
          type: 'maintenance',
          cadence: 'one-time',
          priority: 'urgent',
        })
        results.lockTasks.push(title)
      }
    }
  } catch (e: any) {
    results.lockError = e?.message
  }

  return NextResponse.json({ ok: true, ...results })
}
