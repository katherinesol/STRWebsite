import { cookies } from 'next/headers'

// Centralized auth. For now this checks the legacy ADMIN_SECRET cookie exactly
// as before — no behavior change. Later we swap the internals to Supabase Auth
// and every caller switches at once.

export type AuthResult =
  | { ok: true; userId: string | null; role: string }
  | { ok: false }

// Returns auth status. Legacy mode: cookie must equal ADMIN_SECRET.
export async function getAuth(): Promise<AuthResult> {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')?.value
  if (session && session === process.env.ADMIN_SECRET) {
    // legacy single admin is treated as owner
    return { ok: true, userId: null, role: 'owner' }
  }
  return { ok: false }
}

// Convenience for API routes: returns true if authed.
export async function isAuthed(): Promise<boolean> {
  const a = await getAuth()
  return a.ok
}
