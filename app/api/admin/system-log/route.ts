import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const type = request.nextUrl.searchParams.get('type')
  const supabase = createAdminClient()
  let q = supabase.from('system_log').select('*').order('created_at', { ascending: false }).limit(200)
  if (type && type !== 'all') q = q.eq('event_type', type)
  const { data } = await q
  // distinct types for the filter
  const { data: allTypes } = await supabase.from('system_log').select('event_type')
  const types = [...new Set((allTypes || []).map((r: any) => r.event_type))]
  return NextResponse.json({ entries: data || [], types })
}
