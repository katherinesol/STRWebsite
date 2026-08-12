import { NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// returns all stay-group members (booking_id -> group_id) for calendar linking
export async function GET() {
  if (!await hasRole('owner', 'co-owner', 'cleaner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()
  const { data } = await supabase.from('stay_group_members').select('booking_id, group_id, role, booking_kind')
  return NextResponse.json({ members: data || [] })
}
