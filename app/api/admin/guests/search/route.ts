import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === process.env.ADMIN_SECRET
}

export async function GET(request: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ guests: [] })
  const q = request.nextUrl.searchParams.get('q') || ''
  if (q.length < 2) return NextResponse.json({ guests: [] })

  const supabase = createAdminClient()

  const { data: guests } = await supabase
    .from('guests')
    .select('id, name, email, phone')
    .ilike('name', `%${q}%`)
    .limit(8)

  // get booking counts
  const guestIds = (guests || []).map(g => g.id)
  const { data: bookings } = await supabase
    .from('bookings')
    .select('guest_id')
    .in('guest_id', guestIds)
    .neq('status', 'cancelled')

  const countMap: Record<string, number> = {}
  for (const b of bookings || []) {
    countMap[b.guest_id] = (countMap[b.guest_id] || 0) + 1
  }

  const result = (guests || []).map(g => ({
    ...g,
    bookingCount: countMap[g.id] || 0,
  }))

  return NextResponse.json({ guests: result })
}
