import { NextRequest, NextResponse } from 'next/server'
import { hasRole, getAuth, isSuperadmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// list all users (owner only)
export async function GET() {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, active, created_at, permissions, is_superadmin')
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const viewerIsSuper = await isSuperadmin()
  return NextResponse.json({ users: data, viewerIsSuper })
}

// invite a new user by email (owner only) — they set their own password
export async function POST(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  const { email, name, role } = await request.json()
  if (!email || !name) {
    return NextResponse.json({ error: 'Email and name are required' }, { status: 400 })
  }
  const supabase = createAdminClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://rental-direct-five.vercel.app'
  // send the invite email; they land on /set-password to choose a password
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { name, role: role || 'cleaner' },
    redirectTo: `${siteUrl}/set-password`,
  })
  if (error) {
    const msg = error.message?.includes('already been registered')
      ? 'That email already has an account.'
      : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  return NextResponse.json({ ok: true, id: data.user?.id, invited: true })
}

// deactivate / reactivate / change role (owner only)
export async function PATCH(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  const { id, active, role, name, permissions } = await request.json()
  const me = await getAuth()
  // safety: don't let the owner deactivate or demote themselves
  if (me.ok && me.userId === id && (active === false || (role && role !== 'owner'))) {
    return NextResponse.json({ error: "You can't deactivate or demote your own account" }, { status: 400 })
  }
  const supabase = createAdminClient()
  const updates: any = {}
  if (active != null) updates.active = active
  if (role) updates.role = role
  if (name != null && name.trim()) updates.name = name.trim()
  // permissions can ONLY be changed by the superadmin (Katherine)
  if (permissions !== undefined) {
    if (!await isSuperadmin()) return NextResponse.json({ error: 'Only the account owner can change permissions' }, { status: 403 })
    updates.permissions = permissions
  }
  const { error } = await supabase.from('profiles').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
