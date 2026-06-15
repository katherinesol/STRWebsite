import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === process.env.ADMIN_SECRET
}

export async function GET() {
  if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = process.env.PTDEVICES_TOKEN
  const deviceId = process.env.PTDEVICES_CISTERN_DEVICE_ID
  if (!token || !deviceId) {
    return NextResponse.json({ error: 'Cistern monitoring not configured' }, { status: 503 })
  }

  const supabase = createAdminClient()
  const { data: cal } = await supabase.from('cistern_calibration').select('*').eq('id', 'default').maybeSingle()
  const fullPoint = Number(cal?.full_point ?? 100)
  const emptyPoint = Number(cal?.empty_point ?? 0)
  const lowThreshold = Number(cal?.low_threshold ?? 25)

  try {
    const res = await fetch(
      `https://api.ptdevices.com/token/v1/device/${deviceId}?api_token=${token}`,
      { next: { revalidate: 300 } }
    )
    if (!res.ok) return NextResponse.json({ error: 'PTDevices unreachable' }, { status: 502 })
    const json = await res.json()
    const d = json.data
    const raw = d?.device_data?.percent_level ?? null

    // apply calibration
    let calibrated: number | null = null
    if (raw != null && fullPoint > emptyPoint) {
      calibrated = Math.round(Math.max(0, Math.min(100, ((raw - emptyPoint) / (fullPoint - emptyPoint)) * 100)))
    }

    return NextResponse.json({
      rawPercent: raw,
      percent: calibrated,
      fullPoint, emptyPoint, lowThreshold,
      battery: d?.device_data?.battery_status ?? null,
      status: d?.status ?? null,
      reported: d?.reported ?? null,
      title: d?.title ?? 'Cistern',
    })
  } catch {
    return NextResponse.json({ error: 'Fetch failed' }, { status: 500 })
  }
}

// save calibration
export async function PATCH(request: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
