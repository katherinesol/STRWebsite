import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()
  const { data } = await supabase.from('passkeys').select('id, device_name, created_at, last_used_at').eq('user_id', auth.userId).order('created_at')
  return NextResponse.json({ passkeys: data || [] })
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id } = await request.json()
  const supabase = createAdminClient()
  await supabase.from('passkeys').delete().eq('id', id).eq('user_id', auth.userId)
  return NextResponse.json({ ok: true })
}
