import { createAuthClient } from '@/lib/supabase/auth-server'
import { permits } from '@/lib/permissions'
import { createAdminClient } from '@/lib/supabase/server'

export type AuthResult =
  | { ok: true; userId: string | null; role: string; name?: string; isSuperadmin?: boolean; permissions?: Record<string, any> }
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
        .select('role, name, active, is_superadmin, permissions')
        .eq('id', user.id)
        .maybeSingle()
      if (profile && profile.active !== false) {
        return { ok: true, userId: user.id, role: profile.role || 'cleaner', name: profile.name, isSuperadmin: profile.is_superadmin || false, permissions: profile.permissions || {} }
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

// Only the superadmin (Katherine) can change permissions.
export async function isSuperadmin(): Promise<boolean> {
  const a = await getAuth()
  return a.ok && a.isSuperadmin === true
}

// Granular permission check. category e.g. 'money', level 'view' | 'edit'.
// Owners get everything. Others checked against their stored permissions.
export async function hasPermission(category: string, level: 'view' | 'edit' = 'view'): Promise<boolean> {
  const a = await getAuth()
  if (!a.ok) return false
  // the rule itself lives in lib/permissions.ts so it can be exercised against a
  // real profile without a request; this only supplies the identity
  return permits({ role: a.role, isSuperadmin: a.isSuperadmin, permissions: a.permissions }, category, level)
}

// Calendar-specific granular checks.
export async function canAddBlocks(): Promise<boolean> {
  const a = await getAuth()
  if (!a.ok) return false
  if (a.role === 'owner' || a.isSuperadmin) return true
  return !!(a.permissions?.calendar?.addBlocks)
}
export async function canDeleteOwnBlocks(): Promise<boolean> {
  const a = await getAuth()
  if (!a.ok) return false
  if (a.role === 'owner' || a.isSuperadmin) return true
  return !!(a.permissions?.calendar?.deleteOwn)
}
