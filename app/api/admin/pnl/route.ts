import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

/*  Combined profit and loss — one business, one number.
 *
 *  REVENUE IS WHAT WAS EARNED, not what the guest paid and not what the bank
 *  received. Those three differ by more than twenty thousand dollars and only
 *  one of them is income:
 *
 *    guest_total    104,413.02   includes tax and the platform's own guest fee
 *    payout_amount   87,827.28   net of commission, so it hides a real expense
 *    earned          82,723.75   accommodation − discount + cleaning + extras
 *
 *  guest_total is wrong twice over: $11,499.03 of it is tax collected for the
 *  government, and $10,190.24 is the platform's guest service fee — money the
 *  guest paid Airbnb or VRBO that never reached this business. payout_amount is
 *  wrong the other way, netting off $3,816.31 of commission that is a real and
 *  deductible cost. So revenue is earned, and commission and processing appear
 *  where they belong, on the expense side.
 *
 *  The identity that proves the columns are read correctly, and it holds for all
 *  39 platform bookings individually, not merely in total:
 *
 *    earned + taxes_you_remit − commission − processing = payout_amount
 *
 *  TAX IS NOT INCOME AND NOT AN EXPENSE. It is collected on the government's
 *  behalf and owed onward; putting it anywhere in this statement would overstate
 *  one side or the other. It is reported separately, as a liability, so the
 *  figure is visible without being counted.
 *
 *  COMBINED ONLY, deliberately. It is one business filing one return, so nothing
 *  is apportioned between properties. Per-property attribution is a later layer
 *  and is blocked anyway: the Royal York model has four units and the system
 *  knows two, and 86% of expenses sit under ids that predate that discovery.
 *
 *  The commercial unit needs no special handling. Its improvements are paid
 *  personally and so are this business's costs, and its income belongs to a
 *  separate corporation with no path into this database — the entity boundary
 *  holds because the data cannot cross it, not because a filter says so. */

export async function GET(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  const supabase = createAdminClient()
  const year = request.nextUrl.searchParams.get('year') || 'all'
  const inYear = (d: any) => year === 'all' || String(d || '').startsWith(year)

  const [{ data: plat }, { data: direct }, { data: expenses }, { data: other }] = await Promise.all([
    supabase.from('calendar_blocks')
      .select('id, guest_name, platform, property_id, start_date, accommodation, discount, cleaning_fee, extras, commission, payment_processing_fee, taxes_collected, taxes_you_remit, taxes_platform_remits, payout_amount, guest_total')
      .eq('is_booking', true),
    supabase.from('bookings')
      .select('id, booking_reference, property_id, check_in, accommodation, cleaning_fee, addon_fee, hst, mat, total, is_comp, guests:guest_id(name)'),
    supabase.from('expenses').select('id, date, vendor, description, amount, category, property_id, hst_paid'),
    supabase.from('payments').select('id, amount, paid_at, kind, property_id, note, reference').not('kind', 'is', null),
  ])

  const n = (v: any) => Number(v) || 0
  const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100
  const sum = (a: any[], f: (x: any) => number) => r2(a.reduce((t, x) => t + f(x), 0))

  const P = (plat || []).filter(b => inYear(b.start_date))
  const D = (direct || []).filter(b => inYear(b.check_in))
  const E = (expenses || []).filter(e => inYear(e.date))
  const O = (other || []).filter(o => inYear(o.paid_at))

  const platEarned = (b: any) => n(b.accommodation) - n(b.discount) + n(b.cleaning_fee) + n(b.extras)
  const dirEarned = (b: any) => n(b.accommodation) + n(b.cleaning_fee) + n(b.addon_fee)

  const revenue = {
    platform: sum(P, platEarned),
    direct: sum(D, dirEarned),
    other: sum(O, (o) => n(o.amount)),
  }
  const revenueTotal = r2(revenue.platform + revenue.direct + revenue.other)

  // expenses: the recorded ones, plus the two the platforms deduct at source
  const byCategory: Record<string, number> = {}
  for (const e of E) byCategory[e.category || 'Uncategorised'] = r2((byCategory[e.category || 'Uncategorised'] || 0) + n(e.amount))
  const recorded = sum(E, e => n(e.amount))
  const commission = sum(P, b => n(b.commission))
  const processing = sum(P, b => n(b.payment_processing_fee))
  const expenseTotal = r2(recorded + commission + processing)

  /*  Tax, reported and never counted. Collected is what guests paid; owed is
      what the rules say; the platforms remit part of it themselves. None of it
      is income and none of it is an expense. */
  const tax = {
    collected: sum(P, b => n(b.taxes_collected)),
    passed_to_you: sum(P, b => n(b.taxes_you_remit)),
    platform_remits: sum(P, b => n(b.taxes_platform_remits)),
    hst_paid_on_expenses: sum(E, e => n(e.hst_paid)),
  }

  /*  Bookings with no figures cannot contribute revenue, so a total drawn over
      them silently understates. Say so rather than quietly summing. Comped stays
      are excluded from the warning — a free stay legitimately earns nothing. */
  const incomplete = D.filter(b => !b.is_comp && !(n(b.accommodation) > 0) && !(n(b.total) > 0))
    .map(b => ({ id: b.id, ref: b.booking_reference, guest: (b.guests as any)?.name || null, check_in: b.check_in }))

  const years = [...new Set([
    ...(plat || []).map(b => String(b.start_date || '').slice(0, 4)),
    ...(direct || []).map(b => String(b.check_in || '').slice(0, 4)),
    ...(expenses || []).map(e => String(e.date || '').slice(0, 4)),
  ].filter(Boolean))].sort().reverse()

  return NextResponse.json({
    year, years,
    revenue: {
      ...revenue, total: revenueTotal,
      platform_count: P.length, direct_count: D.filter(b => !b.is_comp).length, other_count: O.length,
    },
    expenses: {
      byCategory: Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount })),
      recorded, commission, processing, total: expenseTotal, count: E.length,
    },
    net: r2(revenueTotal - expenseTotal),
    tax,
    other_income: O,
    incomplete,
  })
}
