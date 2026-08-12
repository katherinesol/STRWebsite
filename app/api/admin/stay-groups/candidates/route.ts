import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const sp = request.nextUrl.searchParams
  const property = sp.get('property') || ''
  const exclude = sp.get('exclude') || ''
  const near = sp.get('near') || ''
  const supabase = createAdminClient()

  const nearDate = near ? new Date(near + 'T00:00:00') : new Date()
  const lo = new Date(nearDate); lo.setDate(lo.getDate() - 7)
  const hi = new Date(nearDate); hi.setDate(hi.getDate() + 7)
  const loStr = lo.toISOString().split('T')[0]
  const hiStr = hi.toISOString().split('T')[0]

  const candidates: any[] = []

  const { data: blocks } = await supabase.from('calendar_blocks')
    .select('id, guest_name, start_date, end_date, platform')
    .eq('property_id', property).eq('is_booking', true)
    .gte('end_date', loStr).lte('end_date', hiStr)
  for (const b of blocks || []) {
    if (b.id === exclude) continue
    candidates.push({ id: b.id, kind: 'platform', guest_name: b.guest_name, start_date: b.start_date, end_date: b.end_date, platform: b.platform })
  }

  const { data: direct } = await supabase.from('bookings')
    .select('id, guest_info, check_in, check_out')
    .eq('property_id', property)
    .gte('check_out', loStr).lte('check_out', hiStr)
  for (const b of direct || []) {
    if (b.id === exclude) continue
    const nm = Array.isArray(b.guest_info) ? (b.guest_info as any[])[0]?.name : (b.guest_info as any)?.name
    candidates.push({ id: b.id, kind: 'direct', guest_name: nm, start_date: b.check_in, end_date: b.check_out, platform: 'direct' })
  }

  candidates.sort((a, b) => (b.end_date || '').localeCompare(a.end_date || ''))
  return NextResponse.json({ candidates })
}
