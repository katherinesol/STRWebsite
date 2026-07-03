import { getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// Resolves what the current user can access for tasks.
// Owner: all properties. Cleaner: only assigned properties.
export async function getTaskAccess() {
  const auth = await getAuth()
  if (!auth.ok) return { ok: false as const }

  if (auth.role === 'owner') {
    return { ok: true as const, role: 'owner', userId: auth.userId, name: auth.name, propertyIds: null as null } // null = all
  }

  // cleaner: load assigned properties
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('property_assignments')
    .select('property_id')
    .eq('user_id', auth.userId)
  const propertyIds = (data || []).map(r => r.property_id)
  return { ok: true as const, role: auth.role, userId: auth.userId, name: auth.name, propertyIds }
}

// can this user act on a given property?
export function canAccessProperty(access: { role: string; propertyIds: string[] | null }, propertyId: string | null) {
  if (access.role === 'owner') return true
  if (!propertyId) return false // cleaners can't act on "general" (null-property) tasks
  return (access.propertyIds || []).includes(propertyId)
}
