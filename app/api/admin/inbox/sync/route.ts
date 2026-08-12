import { NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { syncRepull } from '@/lib/repull-sync'

export async function POST() {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  try {
    const result = await syncRepull()
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
