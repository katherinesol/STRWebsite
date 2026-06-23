import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed } from '@/lib/auth'


export async function GET(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
