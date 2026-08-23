import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'
import { computeTaxSplit } from '@/lib/tax-rates'
import { resolveApplyTax } from '@/lib/booking-tax'

/** The only path money may take onto a direct booking.
 *
 *  The PATCH beside this refuses accommodation, cleaning_fee, hst, mat and total,
 *  because those are not opinions you type. They are derived: MAT is 6% in
 *  Toronto and 4% at Nickel Beach, it applies to the room only, and a stay over
 *  29 nights is exempt outright. The old edit form hardcoded `accom * 0.04` for
 *  every property and never checked the exemption, so a Royal York booking saved
 *  through it recorded $400 of MAT where the rules say $600.
 *
 *  You give it what you know — the room subtotal, the cleaning fee, any extras —
 *  and it works out the rest from lib/tax-rates.ts, the same module the MAT
 *  return and Haussy use. One rule, three callers.
 *
 *  APPLY_TAX IS OBEYED, NOT ASSUMED. A direct booking defaults to apply_tax=false
 *  (see defaultApplyTax) and all three on file are explicitly false, which is why
 *  every one of them carries hst=0 and mat=0. This endpoint does not quietly
 *  start charging tax on them; when the toggle is off it writes zeros and says so
 *  in the response. Turning it on is the held TaxToggleField's job, once the
 *  VRBO/Airbnb audit settles.
 *
 *  NO DISCOUNT FIELD. calendar_blocks has one; bookings does not. Rather than net
 *  a discount into accommodation and lose the record of it, this refuses the key
 *  and asks for the already-discounted room subtotal. Giving discounts a column
 *  is a migration, not a Sunday-night edit. */

type Body = {
  accommodation?: number | string
  cleaning?: number | string
  extras?: number | string
  /** compute and return, write nothing — what the confirm panel calls first */
  preview?: boolean
}

const n = (v: any) => {
  if (v === '' || v == null) return 0
  const x = Number(v)
  return Number.isFinite(x) ? x : NaN
}
const r2 = (v: number) => Math.round(v * 100) / 100

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  if (!await hasPermission('money', 'edit')) {
    return NextResponse.json({ error: 'Not allowed to record figures' }, { status: 403 })
  }

  const { id } = await params
  const raw = (await request.json().catch(() => null)) as Body | null
  if (!raw || typeof raw !== 'object') {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 })
  }

  const ACCEPTED = new Set(['accommodation', 'cleaning', 'extras', 'preview'])
  const rejected = Object.keys(raw).filter(k => !ACCEPTED.has(k))
  if (rejected.includes('discount')) {
    return NextResponse.json({
      error: 'There is no discount column on a direct booking. Give the room subtotal already net of it.',
      rejected,
    }, { status: 400 })
  }
  if (rejected.length) {
    return NextResponse.json({
      error: 'HST, MAT and total are computed here, never supplied.',
      rejected,
      accepted: ['accommodation', 'cleaning', 'extras'],
    }, { status: 400 })
  }

  const accommodation = n(raw.accommodation)
  const cleaning = n(raw.cleaning)
  const extras = n(raw.extras)
  if ([accommodation, cleaning, extras].some(Number.isNaN)) {
    return NextResponse.json({ error: 'Amounts must be numbers.' }, { status: 400 })
  }
  if (accommodation < 0 || cleaning < 0 || extras < 0) {
    return NextResponse.json({ error: 'Amounts cannot be negative.' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: b } = await supabase.from('bookings')
    .select('id, property_id, check_in, check_out, nights, apply_tax, accommodation, cleaning_fee, addon_fee, hst, mat, total')
    .eq('id', id).maybeSingle()
  if (!b) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (!b.check_in || !b.check_out) {
    return NextResponse.json({ error: 'The booking needs dates before its tax can be worked out.' }, { status: 400 })
  }

  const nights = Math.max(
    1,
    Math.round((new Date(b.check_out + 'T00:00:00Z').getTime() - new Date(b.check_in + 'T00:00:00Z').getTime()) / 86400000),
  )

  /* Cleaning IS in the HST base, and extras with it — computeTaxSplit makes the
     caller pass them explicitly so the choice is never implied. MAT still sees
     the room alone. */
  const applied = resolveApplyTax(b.apply_tax, 'direct')
  const split = computeTaxSplit({
    propertyId: b.property_id,
    checkIn: b.check_in,
    nights,
    accommodation,
    cleaning,
    hstTaxableExtras: extras,
  })
  const hst = applied ? split.hst : 0
  const mat = applied ? split.mat : 0

  /* NOT split.totalOwed — that is the tax alone. The total column is what the
     guest owes, and unpaid() subtracts payments from it, so it has to be the
     whole bill or every payment check downstream is wrong. */
  const total = r2(split.room + cleaning + extras + hst + mat)

  const after = {
    accommodation: r2(accommodation), cleaning_fee: r2(cleaning), addon_fee: r2(extras),
    hst, mat, total, nights,
  }
  const before = {
    accommodation: b.accommodation, cleaning_fee: b.cleaning_fee, addon_fee: b.addon_fee,
    hst: b.hst, mat: b.mat, total: b.total, nights: b.nights,
  }
  const workings = {
    apply_tax: applied,
    room: split.room,
    mat_rate: split.matRate,
    mat_exempt: split.matExempt,
    hst_base: applied ? split.hstBase : 0,
    note: applied
      ? `MAT ${(split.matRate * 100).toFixed(1)}% on the room; HST 13% on room + cleaning + extras + MAT.`
      : 'apply_tax is off for this booking, so HST and MAT are written as zero. The total is room + cleaning + extras.',
  }

  if (raw.preview) return NextResponse.json({ ok: true, preview: true, before, after, workings })

  const { error } = await supabase.from('bookings').update(after).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, before, after, workings })
}
