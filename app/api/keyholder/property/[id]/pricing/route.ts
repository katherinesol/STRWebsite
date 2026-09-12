import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'
import { pick, rejection } from '@/lib/allowlist'
import { loadPlatformRates } from '@/lib/platform-rates'
import { quote, type FeeKind } from '@/lib/gross-up'

/*  Saving what Katherine keeps.
 *
 *  FOUR TARGETS GO IN. NO PRICE COMES OUT — not into a column, anyway. The list
 *  price on each platform is derived from the target every time it is read, so
 *  there is nothing stored to drift when a commission moves. The response
 *  carries the computed prices so the caller can SEE them, and they are computed
 *  by the same quote() against the same loadPlatformRates() the calculator drew
 *  its screen with. That is the whole guarantee: the number Katherine decided
 *  against and the number that goes live come from one function reading one
 *  table, so they cannot be different numbers.
 *
 *  MONEY:EDIT, NOT PROPERTY:EDIT. This sets what the business earns per night,
 *  which is a different permission from fixing a typo in a house rule — and it
 *  matches the tab, which is already behind money:view.
 *
 *  NULL CLEARS, IT DOES NOT MEAN ZERO. Sending null puts a target back to
 *  undecided; sending 0 says keep nothing, which is a real if unusual intent.
 *  The two must not collapse into each other, so null is passed through rather
 *  than coerced. */

const ALLOWED = [
  'target_net_nightly', 'target_net_cleaning', 'target_net_pet', 'target_net_extra_guest_rate',
] as const

const KIND: Record<string, FeeKind> = {
  target_net_nightly: 'nightly',
  target_net_cleaning: 'cleaning',
  target_net_pet: 'pet',
  target_net_extra_guest_rate: 'extra_guest',
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('money', 'edit')) {
    return NextResponse.json({ error: 'Not allowed to set pricing' }, { status: 403 })
  }

  const { id } = await params
  const p = pick(await request.json().catch(() => null), ALLOWED)
  if (!p.ok) return NextResponse.json(rejection(p.rejected, ALLOWED), { status: 400 })
  if (!Object.keys(p.fields).length) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })

  /*  Checked here as well as by the column constraint. The constraint is the
   *  thing that cannot be bypassed; this is the thing that can explain itself. */
  const fields: Record<string, number | null> = {}
  for (const [k, v] of Object.entries(p.fields)) {
    if (v === null || v === '') { fields[k] = null; continue }
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: `${k} must be a number of dollars, or empty to leave it undecided.` }, { status: 400 })
    }
    fields[k] = Math.round(n * 100) / 100
  }

  const supabase = createAdminClient()
  const { data: property } = await supabase.from('properties').select('id').eq('id', id).maybeSingle()
  if (!property) return NextResponse.json({ error: 'No such property' }, { status: 404 })

  const { data: saved, error } = await supabase
    .from('property_pricing')
    .upsert({ property_id: id, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'property_id' })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  /*  What a guest will now be asked for, worked out the same way the calculator
   *  worked it out. Returned, never stored. */
  const rates = await loadPlatformRates()
  const prices: Record<string, any> = {}
  for (const col of ALLOWED) {
    const net = (saved as any)[col]
    if (net == null) continue
    prices[col] = quote(Number(net), id, KIND[col], rates)
  }

  return NextResponse.json({ ok: true, saved: Object.fromEntries(ALLOWED.map(c => [c, (saved as any)[c]])), prices })
}
