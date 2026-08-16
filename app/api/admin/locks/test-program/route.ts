import { NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { programBookingLocks } from '@/lib/seam'
import { chooseGuestCode } from '@/lib/lock-codes'

export async function GET(request: Request) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const platform = new URL(request.url).searchParams.get('platform') || 'direct'
  const phone = '+1 555 123 4407'
  const code = await chooseGuestCode('royal-york-west', phone)
  const now = new Date()
  const end = new Date(now.getTime() + 2 * 3600 * 1000)
  const r = await programBookingLocks({
    propertyId: 'royal-york-west', platform,
    code, phone,
    name: 'TEST — delete me', startsAt: now.toISOString(), endsAt: end.toISOString(),
  })
  return NextResponse.json(r)
}
