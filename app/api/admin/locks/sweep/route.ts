import { NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { Seam } from 'seam'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const apiKey = process.env.SEAM_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'SEAM_API_KEY not set' }, { status: 500 })
  const seam = new Seam({ apiKey })
  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const checkedAt = new Date().toISOString()

  const { data: allLocks } = await supabase.from('property_locks').select('*').eq('active', true)
  const locksFor = (pid: string) => (allLocks || []).filter((l: any) => l.property_id === pid)

  // cache codes-per-device once, so we don't re-list a lock repeatedly
  const deviceCache: Record<string, any[]> = {}
  async function codesOn(deviceId: string) {
    if (!deviceCache[deviceId]) { try { deviceCache[deviceId] = await seam.accessCodes.list({ device_id: deviceId }) } catch { deviceCache[deviceId] = [] } }
    return deviceCache[deviceId]
  }

  function statusFor(door: any, expectedCode: string, isAirbnb: boolean) {
    const match = expectedCode ? door.find((c: any) => c.code === expectedCode) : null
    if (!match) return { status: isAirbnb ? 'airbnb (unconfirmed)' : 'missing', errored: false, scheduled: false }
    return { status: match.status, errored: (match.errors || []).length > 0, scheduled: !!match.is_scheduled_on_device }
  }

  const rows: any[] = []

  // platform bookings
  const { data: plat } = await supabase.from('calendar_blocks')
    .select('id, property_id, platform, start_date, end_date, door_code, guest_name, checked_in_at')
    .eq('is_booking', true).gte('end_date', today).order('start_date')

  for (const b of plat || []) {
    if (b.start_date < today) continue // stay already underway — code is live, don't flag
    const isAirbnb = b.platform === 'airbnb'
    if (isAirbnb && b.property_id === 'nickel-beach') continue // airbnb owns it, nothing to track
    const code = String(b.door_code || '').replace(/\D/g, '').slice(-4)
    const doors: any[] = []
    for (const lock of locksFor(b.property_id)) {
      if (isAirbnb && lock.airbnb_managed) continue // airbnb owns unit door; we don't program it
      const codes = await codesOn(lock.seam_device_id)
      const st = statusFor(codes, code, false)
      doors.push({ lock: lock.lock_name, code: code || null, ...st })
    }
    const hrsUntil = (new Date(b.start_date + 'T16:00:00').getTime() - Date.now()) / 3600000
    const within72 = hrsUntil < 72
    const anyBad = doors.some(d => d.errored || d.status === 'missing' || (within72 && d.status !== 'set' && !d.scheduled))
    const allReady = doors.length > 0 && doors.every(d => d.status === 'set' || d.scheduled)
    const status = { doors, all_set: allReady, needs_attention: anyBad, within72, checked_at: checkedAt }
    await supabase.from('calendar_blocks').update({ lock_status: status }).eq('id', b.id)
    rows.push({ id: b.id, kind: 'platform', guest: b.guest_name, property: b.property_id, platform: b.platform, start: b.start_date, end: b.end_date, code: code || null, checked_in_at: b.checked_in_at, ...status })
  }

  // direct bookings
  const { data: direct } = await supabase.from('bookings')
    .select('id, property_id, check_in, check_out, lock_code, guest_id, checked_in_at, guests:guest_id(name)')
    .gte('check_out', today).order('check_in')

  for (const b of direct || []) {
    if (b.check_in < today) continue // stay underway
    const code = String(b.lock_code || '').replace(/\D/g, '').slice(-4)
    const doors: any[] = []
    for (const lock of locksFor(b.property_id)) {
      const codes = await codesOn(lock.seam_device_id)
      const st = statusFor(codes, code, false)
      doors.push({ lock: lock.lock_name, code: code || null, ...st })
    }
    const hrsUntil = (new Date(b.check_in + 'T16:00:00').getTime() - Date.now()) / 3600000
    const within72 = hrsUntil < 72
    const anyBad = doors.some(d => d.errored || d.status === 'missing' || (within72 && d.status !== 'set' && !d.scheduled))
    const allReady = doors.length > 0 && doors.every(d => d.status === 'set' || d.scheduled)
    const status = { doors, all_set: allReady, needs_attention: anyBad, within72, checked_at: checkedAt }
    await supabase.from('bookings').update({ lock_status: status }).eq('id', b.id)
    rows.push({ id: b.id, kind: 'direct', guest: (b.guests as any)?.name, property: b.property_id, platform: 'direct', start: b.check_in, end: b.check_out, code: code || null, checked_in_at: b.checked_in_at, ...status })
  }

  rows.sort((a, b) => a.start.localeCompare(b.start))
  return NextResponse.json({ checked_at: checkedAt, count: rows.length, needs_attention: rows.filter(r => r.needs_attention).length, bookings: rows })
}
