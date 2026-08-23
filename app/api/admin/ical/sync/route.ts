import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { syncAllICal, syncICalToDB } from '@/lib/ical-sync'

// Explicit "Sync now". Runs the SAME code as the cron — there is one sync, and this
// is a way to trigger it early, not a second implementation. Returns the per-feed
// report so the button can say what actually happened rather than showing a tick.
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const propertyId = body?.property_id ? String(body.property_id) : null
  try {
    const report = propertyId ? await syncICalToDB(propertyId) : await syncAllICal()
    return NextResponse.json({ ok: true, ...report })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Sync failed' }, { status: 500 })
  }
}
