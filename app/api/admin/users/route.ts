import { NextRequest, NextResponse } from 'next/server'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// list all users (owner only)
export async function GET() {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, active, created_at')
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ users: data })
}

// create a new user (owner only)
export async function POST(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  const { email, password, name, role } = await request.json()
  if (!email || !password || !name) {
    return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }
  const supabase = createAdminClient()
  // create the auth user with metadata — the trigger creates the profile row
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // auto-confirm so they can log in immediately
    user_metadata: { name, role: role || 'cleaner' },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.user?.id })
}

// deactivate / reactivate / change role (owner only)
export async function PATCH(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  const { id, active, role } = await request.json()
  const me = await getAuth()
  // safety: don't let the owner deactivate or demote themselves
  if (me.ok && me.userId === id && (active === false || (role && role !== 'owner'))) {
    return NextResponse.json({ error: "You can't deactivate or demote your own account" }, { status: 400 })
  }
  const supabase = createAdminClient()
  const updates: any = {}
  if (active != null) updates.active = active
  if (role) updates.role = role
  const { error } = await supabase.from('profiles').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
