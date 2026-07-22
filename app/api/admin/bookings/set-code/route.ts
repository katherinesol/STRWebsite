import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { booking_id, source, code } = await request.json()
  if (!booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })
  const supabase = createAdminClient()
  const table = source === 'platform' ? 'calendar_blocks' : 'bookings'
  const { error } = await supabase.from(table).update({ confirmation_code: code || null }).eq('id', booking_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
