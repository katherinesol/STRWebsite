import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCisternLevel } from '@/lib/cistern'
import { isAuthed, hasRole, hasPermission } from '@/lib/auth'


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
/*  CALIBRATION IS A WRITE, AND IT WAS GATED LIKE A READ.
 *
 *  `isAuthed()` alone — any signed-in account, a cleaner included, could rewrite
 *  the full and empty points of the tank. That is not a cosmetic setting: every
 *  percentage on the Today board and every "water used" figure on a stay is
 *  computed through these three numbers, and the reorder alarm fires off the
 *  low threshold. Moving them silently moves every reading derived from them.
 *
 *  It belongs to `property`, not `locks`. A cistern is a physical attribute of a
 *  house — the same category the property editor writes under — and it is not a
 *  door. The GET stays as it was: the level is operational information the whole
 *  team can act on, and reading it changes nothing. */
export async function PATCH(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('property', 'edit')) {
    return NextResponse.json({ error: 'Not allowed to change cistern calibration' }, { status: 403 })
  }
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
