import { createAuthClient } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/server'

export type AuthResult =
  | { ok: true; userId: string | null; role: string; name?: string }
  | { ok: false }

// Checks Supabase Auth session first; falls back to legacy ADMIN_SECRET cookie
// during the migration so nobody gets locked out.
export async function getAuth(): Promise<AuthResult> {
  // 1. Supabase Auth session
  try {
    const supabase = await createAuthClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      // load role + name from profiles
      const admin = createAdminClient()
      const { data: profile } = await admin
        .from('profiles')
        .select('role, name, active')
        .eq('id', user.id)
        .maybeSingle()
      if (profile && profile.active !== false) {
        return { ok: true, userId: user.id, role: profile.role || 'cleaner', name: profile.name }
      }
    }
  } catch {
    // fall through to legacy
  }

  return { ok: false }
}

export async function isAuthed(): Promise<boolean> {
  const a = await getAuth()
  return a.ok
}

// Require a specific role (e.g. 'owner'). Owners pass any role check.
export async function hasRole(...roles: string[]): Promise<boolean> {
  const a = await getAuth()
  if (!a.ok) return false
  if (a.role === 'owner') return true  // owner can do anything
  return roles.includes(a.role)
}
