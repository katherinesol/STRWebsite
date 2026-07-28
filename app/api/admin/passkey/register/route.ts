import { NextRequest, NextResponse } from 'next/server'
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server'
import { getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

function rp(request: NextRequest) {
  const host = request.headers.get('host') || 'localhost:3000'
  const id = host.split(':')[0]
  const origin = `${request.headers.get('x-forwarded-proto') || 'http'}://${host}`
  return { rpID: id, origin, rpName: 'Rental Direct' }
}

// step 1 — issue registration options (a challenge)
export async function GET(request: NextRequest) {
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { rpID, rpName } = rp(request)
  const supabase = createAdminClient()
  const { data: existing } = await supabase.from('passkeys').select('credential_id').eq('user_id', auth.userId)

  const options = await generateRegistrationOptions({
    rpName, rpID,
    userName: (auth.name ?? 'admin') as string,
    userID: new TextEncoder().encode(auth.userId ?? ''),
    attestationType: 'none',
    excludeCredentials: (existing || []).map(p => ({ id: p.credential_id })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  })

  // stash the challenge on the profile to verify against next call
  await supabase.from('profiles').update({ passkey_challenge: options.challenge }).eq('id', auth.userId)
  return NextResponse.json(options)
}

// step 2 — verify the attestation and store the credential
export async function POST(request: NextRequest) {
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { rpID, origin } = rp(request)
  const { attResp, deviceName } = await request.json()
  const supabase = createAdminClient()

  const { data: profile } = await supabase.from('profiles').select('passkey_challenge').eq('id', auth.userId).single()
  if (!profile?.passkey_challenge) return NextResponse.json({ error: 'No challenge — restart setup' }, { status: 400 })

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: attResp,
      expectedChallenge: profile.passkey_challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Verification failed' }, { status: 400 })
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: 'Could not verify passkey' }, { status: 400 })
  }

  const { credential } = verification.registrationInfo
  await supabase.from('passkeys').insert({
    user_id: auth.userId,
    credential_id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString('base64'),
    counter: credential.counter,
    device_name: deviceName || 'Passkey',
  })
  await supabase.from('profiles').update({ passkey_challenge: null }).eq('id', auth.userId)

  return NextResponse.json({ ok: true })
}
