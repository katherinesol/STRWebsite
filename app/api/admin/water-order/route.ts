import { NextRequest, NextResponse } from 'next/server'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { unloggedRefills } from '@/lib/water-orders'

/*  The open order, the companies to pick from, the past deliveries, and any
 *  fill nobody wrote down — all for ONE property.
 *
 *  THE PROPERTY FILTER IS THE POINT. These three queries read water_orders with
 *  no property clause at all, which is invisible while one cistern exists and
 *  wrong the moment a second does: Royal York's order would surface as Nickel
 *  Beach's open delivery, and "Mark delivered" would close the wrong one. That
 *  is the same shape as the bugs already found this session — one physical lock
 *  behind two property rows, a calendar serving every property's blocks, three
 *  tables disagreeing on min_stay. Unscoped reads do not announce themselves;
 *  they wait for the second row. */
export async function GET(request: NextRequest) {
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()
  const property = request.nextUrl.searchParams.get('property') || 'nickel-beach'

  const [{ data: open }, { data: all }, { data: history }] = await Promise.all([
    supabase.from('water_orders').select('*').eq('property_id', property).eq('delivered', false).order('ordered_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('water_orders').select('company').eq('property_id', property),
    supabase.from('water_orders').select('*').eq('property_id', property).eq('delivered', true).order('delivered_at', { ascending: false }).limit(10),
  ])
  const companies = Array.from(new Set((all || []).map(w => w.company).filter(Boolean)))

  /*  Deliveries that happened without anyone recording them. Read from the
   *  level history, because that is where the only evidence of them is. */
  const [{ data: readings }, { data: everyOrder }] = await Promise.all([
    supabase.from('cistern_readings').select('calibrated_level, recorded_at')
      .eq('property_id', property).order('recorded_at', { ascending: true }),
    supabase.from('water_orders').select('delivered_at, expected_date').eq('property_id', property),
  ])
  const unlogged = unloggedRefills(readings || [], everyOrder || [])

  return NextResponse.json({ open: open || null, companies, history: history || [], unlogged })
}

/*  Record a water order — owner + co-owner.
 *
 *  Two shapes, one row. WITHOUT delivered_at this opens an order that is still
 *  coming, exactly as before. WITH delivered_at it backfills one that already
 *  arrived — which is the case the system had no way to express, and why the
 *  10 July and 11 September fills are missing. A delivery that already happened
 *  was never in the future, so ordered_at is stamped to the same day rather
 *  than to now; otherwise a fill from two months ago would sort as this
 *  morning's order and the history would read wrong. */
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()
  const { company, expected_date, property_id, delivered_at } = await request.json()
  const supabase = createAdminClient()

  let backfill: Record<string, any> = {}
  if (delivered_at) {
    const when = new Date(String(delivered_at).length <= 10 ? delivered_at + 'T12:00:00Z' : delivered_at)
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: 'That delivery date could not be read.' }, { status: 400 })
    }
    if (when.getTime() > Date.now() + 86400000) {
      return NextResponse.json({
        error: 'That date is in the future. To record a delivery still coming, leave the delivered date empty and set the expected one.',
      }, { status: 400 })
    }
    backfill = { delivered: true, delivered_at: when.toISOString(), ordered_at: when.toISOString(), auto_detected: false }
  }

  const { error } = await supabase.from('water_orders').insert({
    property_id: property_id || 'nickel-beach',
    company: company || null,
    expected_date: expected_date || null,
    ordered_by: auth.ok ? auth.userId : null,
    ...backfill,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, backfilled: !!delivered_at })
}

// mark delivered — owner + co-owner
export async function PATCH(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('water_orders').update({ delivered: true, delivered_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
