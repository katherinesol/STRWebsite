import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === process.env.ADMIN_SECRET
}

export async function GET(request: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const propertyId = request.nextUrl.searchParams.get('property_id')
  if (!propertyId) return NextResponse.json({ error: 'property_id required' }, { status: 400 })

  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: bookings }, { data: blocks }] = await Promise.all([
    supabase.from('bookings')
      .select('check_in, check_out')
      .eq('property_id', propertyId)
      .in('status', ['pending_payment', 'confirmed', 'active'])
      .gte('check_out', today),
    supabase.from('calendar_blocks')
      .select('start_date, end_date')
      .eq('property_id', propertyId)
      .gte('end_date', today),
  ])

  // every block (including prep days) blocks availability
  const busy = [
    ...(bookings || []).map(b => ({ start: b.check_in, end: b.check_out })),
    ...(blocks || []).map(b => ({ start: b.start_date, end: b.end_date })),
  ]

  return NextResponse.json({ busy })
}
