import { NextRequest, NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/server'
import { authenticator } from 'otplib'

// in-memory rate limiter — max 5 attempts per IP per 15 minutes
const attempts = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const record = attempts.get(ip)
  if (!record || record.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 })
    return true
  }
  if (record.count >= 5) return false
  record.count++
  return true
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many attempts — try again in 15 minutes' }, { status: 429 })
  }

  const body = await request.json()
  const { email, password, token } = body

  // New path: Supabase Auth (email + password)
  if (email) {
    const supabase = await createAuthClient()
    const { data: signIn, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    // second factor, if this account has it enabled
    const userId = signIn?.user?.id
    if (userId) {
      const admin = createAdminClient()
      const { data: profile } = await admin
        .from('profiles')
        .select('totp_enabled, totp_secret, totp_backup_codes')
        .eq('id', userId)
        .maybeSingle()

      if (profile?.totp_enabled && profile.totp_secret) {
        const supplied = String(token || '').trim().toUpperCase()
        if (!supplied) {
          await supabase.auth.signOut()
          return NextResponse.json({ mfaRequired: true }, { status: 200 })
        }

        const codeOk = authenticator.check(supplied, profile.totp_secret)
        const backups: string[] = profile.totp_backup_codes || []
        const backupIdx = backups.indexOf(supplied)

        if (!codeOk && backupIdx === -1) {
          await supabase.auth.signOut()
          return NextResponse.json({ error: 'That code is not valid', mfaRequired: true }, { status: 401 })
        }

        // a used backup code is spent
        if (!codeOk && backupIdx > -1) {
          const remaining = backups.filter((_, i) => i !== backupIdx)
          await admin.from('profiles').update({ totp_backup_codes: remaining }).eq('id', userId)
        }
      }
    }

    // session cookie is set automatically by the auth client
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
}
