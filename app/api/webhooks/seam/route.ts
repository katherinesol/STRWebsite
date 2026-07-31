import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { Webhook } from 'svix'

// Seam signs webhooks with svix. Verify before trusting anything.
export async function POST(request: NextRequest) {
  const secret = process.env.SEAM_WEBHOOK_SECRET
  const payload = await request.text()
  const headers = {
    'svix-id': request.headers.get('svix-id') || '',
    'svix-timestamp': request.headers.get('svix-timestamp') || '',
    'svix-signature': request.headers.get('svix-signature') || '',
  }

  let event: any
  try {
    if (secret) {
      const wh = new Webhook(secret)
      event = wh.verify(payload, headers)  // throws if signature invalid
    } else {
      event = JSON.parse(payload)  // no secret set yet — accept but log
    }
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // only act on a door being unlocked by a code
  if (event?.event_type !== 'lock.unlocked' || !event?.access_code_id) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const supabase = createAdminClient()
  const usedAt = event.occurred_at || event.created_at || new Date().toISOString()

  // find which booking owns this code. We stored door_code/lock_code, but the
  // event gives access_code_id; match by the CODE value via Seam is heavy, so
  // match on the code string we saved. The event carries `code`.
  const code = String(event.code || '').replace(/\D/g, '').slice(-4)
  if (!code) return NextResponse.json({ ok: true, no_code: true })

  // which property does this lock belong to? (event.device_id) — narrows the match
  const { data: lockRow } = await supabase.from('property_locks')
    .select('property_id').eq('seam_device_id', event.device_id).limit(1).maybeSingle()
  const propertyId = lockRow?.property_id || null

  // platform booking whose stay covers now and whose door_code matches
  const today = new Date().toISOString().split('T')[0]
  let platQ = supabase.from('calendar_blocks').select('id, checked_in_at, door_code, start_date, end_date').eq('is_booking', true).lte('start_date', today).gte('end_date', today)
  if (propertyId) platQ = platQ.eq('property_id', propertyId)
  const { data: plat } = await platQ

  for (const b of plat || []) {
    const bc = String(b.door_code || '').replace(/\D/g, '').slice(-4)
    if (bc === code && !b.checked_in_at) {
      await supabase.from('calendar_blocks').update({ checked_in_at: usedAt }).eq('id', b.id)
      return NextResponse.json({ ok: true, checked_in: 'platform', id: b.id })
    }
  }

  let directQ = supabase.from('bookings').select('id, checked_in_at, lock_code, check_in, check_out').lte('check_in', today).gte('check_out', today)
  if (propertyId) directQ = directQ.eq('property_id', propertyId)
  const { data: direct } = await directQ
  for (const b of direct || []) {
    const bc = String(b.lock_code || '').replace(/\D/g, '').slice(-4)
    if (bc === code && !b.checked_in_at) {
      await supabase.from('bookings').update({ checked_in_at: usedAt }).eq('id', b.id)
      return NextResponse.json({ ok: true, checked_in: 'direct', id: b.id })
    }
  }

  return NextResponse.json({ ok: true, matched: false })
}
