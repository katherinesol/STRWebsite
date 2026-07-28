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
  const { email, password, token, passkeyAssertion } = body

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
        // passkey path — verify server-side against the stored challenge/credential
        if (passkeyAssertion) {
          const { origin } = { origin: `${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('host')}` }
          const rpID = (request.headers.get('host') || 'localhost:3000').split(':')[0]
          const { data: prof2 } = await admin.from('profiles').select('passkey_challenge').eq('id', userId).maybeSingle()
          const { data: key } = await admin.from('passkeys').select('*').eq('credential_id', passkeyAssertion.id).eq('user_id', userId).maybeSingle()
          if (!prof2?.passkey_challenge || !key) {
            await supabase.auth.signOut()
            return NextResponse.json({ error: 'Passkey not recognized', mfaRequired: true }, { status: 401 })
          }
          try {
            const { verifyAuthenticationResponse } = await import('@simplewebauthn/server')
            const v = await verifyAuthenticationResponse({
              response: passkeyAssertion,
              expectedChallenge: prof2.passkey_challenge,
              expectedOrigin: origin,
              expectedRPID: rpID,
              credential: { id: key.credential_id, publicKey: Buffer.from(key.public_key, 'base64'), counter: Number(key.counter) },
            })
            if (!v.verified) throw new Error('unverified')
            await admin.from('passkeys').update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('id', key.id)
            await admin.from('profiles').update({ passkey_challenge: null }).eq('id', userId)
            // verified — fall through to complete the session
          } catch {
            await supabase.auth.signOut()
            return NextResponse.json({ error: 'Passkey verification failed', mfaRequired: true }, { status: 401 })
          }
        } else {
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
    }

    // session cookie is set automatically by the auth client
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
}
