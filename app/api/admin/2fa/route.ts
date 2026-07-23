import { NextRequest, NextResponse } from 'next/server'
import { authenticator } from 'otplib'
import * as QRCodeLib from 'qrcode'

const QRCode: any = (QRCodeLib as any).default ?? QRCodeLib
import { getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

function backupCodes(): string[] {
  const CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => CH[Math.floor(Math.random() * CH.length)]).join('')
  )
}

// current 2FA status
export async function GET() {
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()
  const { data } = await supabase.from('profiles').select('totp_enabled').eq('id', auth.userId).maybeSingle()
  return NextResponse.json({ enabled: !!data?.totp_enabled })
}

// start enrolment — generates a secret and QR, does NOT enable yet
export async function POST() {
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()
  const secret = authenticator.generateSecret()
  const uri = authenticator.keyuri(auth.name || 'admin', 'Rental Direct', secret)
  const qr = await QRCode.toDataURL(uri)
  await supabase.from('profiles').update({ totp_secret: secret, totp_enabled: false }).eq('id', auth.userId)
  return NextResponse.json({ qr, secret })
}

// confirm a code and switch it on
export async function PATCH(request: NextRequest) {
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { token } = await request.json()
  const supabase = createAdminClient()
  const { data } = await supabase.from('profiles').select('totp_secret').eq('id', auth.userId).maybeSingle()
  if (!data?.totp_secret) return NextResponse.json({ error: 'Start setup first' }, { status: 400 })
  if (!authenticator.check(String(token || '').trim(), data.totp_secret)) {
    return NextResponse.json({ error: 'That code is not valid — check your authenticator app' }, { status: 400 })
  }
  const codes = backupCodes()
  await supabase.from('profiles').update({ totp_enabled: true, totp_backup_codes: codes }).eq('id', auth.userId)
  return NextResponse.json({ ok: true, backupCodes: codes })
}

// turn it off
export async function DELETE() {
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()
  await supabase.from('profiles').update({ totp_enabled: false, totp_secret: null, totp_backup_codes: null }).eq('id', auth.userId)
  return NextResponse.json({ ok: true })
}
