import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === process.env.ADMIN_SECRET
}

export async function POST(request: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { codes } = await request.json()
  const supabase = createAdminClient()
  const { error } = await supabase.from('access_codes').insert(codes)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
