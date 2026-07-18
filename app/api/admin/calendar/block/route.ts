import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuth, hasRole } from '@/lib/auth'

export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  const auth = await getAuth()
  const body = await request.json()
  const { property_id, start_date, end_date, block_for, block_for_name, notes } = body

  if (!property_id || !start_date || !end_date) {
    return NextResponse.json({ error: 'property, start and end dates required' }, { status: 400 })
  }
  if (new Date(end_date) < new Date(start_date)) {
    return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // conflict check — reject if a confirmed booking overlaps these dates
  const { data: conflicts } = await supabase
    .from('bookings')
    .select('id, check_in, check_out')
    .eq('property_id', property_id)
    .neq('status', 'cancelled')
    .lt('check_in', end_date)
    .gt('check_out', start_date)
  if (conflicts && conflicts.length) {
    return NextResponse.json({ error: 'Those dates overlap an existing booking.' }, { status: 409 })
  }

  // also reject overlap with another block
  const { data: blockConflicts } = await supabase
    .from('calendar_blocks')
    .select('id')
    .eq('property_id', property_id)
    .lt('start_date', end_date)
    .gt('end_date', start_date)
  if (blockConflicts && blockConflicts.length) {
    return NextResponse.json({ error: 'Those dates overlap an existing block.' }, { status: 409 })
  }

  const { error } = await supabase.from('calendar_blocks').insert({
    property_id, start_date, end_date,
    reason: 'owner',
    block_for: block_for || 'myself',
    block_for_name: block_for === 'friends-family' ? (block_for_name || null) : null,
    blocked_by: auth.ok ? auth.userId : null,
    notes: notes || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
