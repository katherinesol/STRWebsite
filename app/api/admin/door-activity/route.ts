import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const property = request.nextUrl.searchParams.get('property')
  const supabase = createAdminClient()
  let q = supabase.from('system_log')
    .select('id, event_type, summary, detail, property_id, created_at')
    .in('event_type', ['door.entry', 'booking.checked_in', 'door.denied'])
    .order('created_at', { ascending: false }).limit(150)
  if (property && property !== 'all') q = q.eq('property_id', property)
  const { data } = await q
  return NextResponse.json({ entries: data || [] })
}
