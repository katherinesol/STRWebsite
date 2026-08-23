import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole } from '@/lib/auth'


/* Guest records are the most personal table here — names, email addresses,
 * phone numbers and free-text notes. Every route on it was isAuthed(), so any
 * signed-in account could pull the whole list. Same hole as the booking PATCH,
 * closed the same way. */
export async function GET(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const q = request.nextUrl.searchParams.get('q') || ''
  if (q.length < 2) return NextResponse.json({ guests: [] })

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('guests')
    .select('id, name, email, phone')
    .ilike('name', `%${q}%`)
    .limit(8)

  return NextResponse.json({ guests: data || [] })
}
