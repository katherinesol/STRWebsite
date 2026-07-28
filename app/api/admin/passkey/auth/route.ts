import { NextRequest, NextResponse } from 'next/server'
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server'
import { createAdminClient } from '@/lib/supabase/server'

function rp(request: NextRequest) {
  const host = request.headers.get('host') || 'localhost:3000'
  return { rpID: host.split(':')[0], origin: `${request.headers.get('x-forwarded-proto') || 'http'}://${host}` }
}

// step 1 — issue an authentication challenge (after password succeeds, before session completes)
export async function GET(request: NextRequest) {
  const { rpID } = rp(request)
  const email = request.nextUrl.searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })
  const supabase = createAdminClient()

  const { data: profile } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle()
  if (!profile) return NextResponse.json({ error: 'No account' }, { status: 404 })

  const { data: keys } = await supabase.from('passkeys').select('credential_id').eq('user_id', profile.id)
  if (!keys?.length) return NextResponse.json({ error: 'No passkeys' }, { status: 404 })

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: keys.map(k => ({ id: k.credential_id })),
    userVerification: 'preferred',
  })
  await supabase.from('profiles').update({ passkey_challenge: options.challenge }).eq('id', profile.id)
  return NextResponse.json(options)
}

// step 2 — verify the assertion; returns ok so the login route can complete the session
export async function POST(request: NextRequest) {
  const { rpID, origin } = rp(request)
  const { email, assertion } = await request.json()
  const supabase = createAdminClient()

  const { data: profile } = await supabase.from('profiles').select('id, passkey_challenge').eq('email', email).maybeSingle()
  if (!profile?.passkey_challenge) return NextResponse.json({ error: 'No challenge' }, { status: 400 })

  const { data: key } = await supabase.from('passkeys').select('*').eq('credential_id', assertion.id).eq('user_id', profile.id).maybeSingle()
  if (!key) return NextResponse.json({ error: 'Unknown passkey' }, { status: 400 })

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: profile.passkey_challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: key.credential_id,
        publicKey: Buffer.from(key.public_key, 'base64'),
        counter: Number(key.counter),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Verification failed' }, { status: 400 })
  }

  if (!verification.verified) return NextResponse.json({ error: 'Could not verify' }, { status: 400 })

  await supabase.from('passkeys').update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('id', key.id)
  await supabase.from('profiles').update({ passkey_challenge: null }).eq('id', profile.id)
  return NextResponse.json({ ok: true })
}
