import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCisternLevel } from '@/lib/cistern'
import { isAuthed } from '@/lib/auth'


export async function GET() {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Shared getCisternLevel runs auto-delivery detection on this dashboard fetch too.
  const level = await getCisternLevel(false)
  if (!level || (level.percent == null && level.rawPercent == null)) {
    return NextResponse.json({ error: 'Cistern unreachable' }, { status: 502 })
  }
  return NextResponse.json({
    rawPercent: level.rawPercent,
    percent: level.percent,
    fullPoint: level.fullPoint,
    emptyPoint: level.emptyPoint,
    lowThreshold: level.lowThreshold,
    battery: level.battery ?? null,
    status: level.status ?? null,
    reported: level.reported ?? null,
    title: level.title ?? 'Cistern',
  })
}

// save calibration
export async function PATCH(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const supabase = createAdminClient()
  const { error } = await supabase.from('cistern_calibration').upsert({
    id: 'default',
    full_point: Number(body.full_point) || 100,
    empty_point: Number(body.empty_point) || 0,
    low_threshold: Number(body.low_threshold) || 25,
    updated_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
