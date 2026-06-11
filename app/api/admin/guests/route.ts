import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === process.env.ADMIN_SECRET
}

export async function POST(request: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, email, phone } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const supabase = createAdminClient()

  // check for existing guest with exact name
  const { data: existing } = await supabase.from('guests').select('id, name').eq('name', name.trim()).maybeSingle()
  if (existing) {
    return NextResponse.json({ error: `Guest "${existing.name}" already exists`, guest: existing }, { status: 409 })
  }

  const { data, error } = await supabase.from('guests').insert({
    name: name.trim(),
    email: email || null,
    phone: phone || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ guest: data })
}
