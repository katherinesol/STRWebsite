import { NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabase/auth-server'

export async function POST() {
  const response = NextResponse.json({ ok: true })

  // sign out of Supabase Auth (clears the sb- session cookies)
  try {
    const supabase = await createAuthClient()
    await supabase.auth.signOut()
  } catch {
    // ignore — still clear the legacy cookie below
  }

  // clear the legacy cookie too
  response.cookies.delete('admin_session')
  return response
}
