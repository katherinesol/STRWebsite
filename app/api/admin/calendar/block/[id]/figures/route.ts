import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'
import { computeTaxSplit } from '@/lib/tax-rates'
import { findGuest, normaliseName, nameTokens, splitName } from '@/lib/keyholder/guest-match'

/** The only path money may take onto a platform booking.
 *
 *  The block PATCH beside this refuses every money column, and until now there
 *  was no endpoint that would accept them — so a screenshot got reconciled with a
 *  raw PATCH, which is how Kristine Nguyen ended up with all her figures, no
 *  guest link, and is_booking still false: a $1,038 payout invisible to income,
 *  the MAT return and Today. Twenty-six bookings still need their figures. This
 *  is that path, and it does the three things a raw PATCH cannot.
 *
 *  TWO KINDS OF NUMBER, and conflating them is the whole trap.
 *
 *  OWED is computed here, never accepted: hst and mat come from the property's
 *  real rate with the 30-night exemption applied and cleaning inside the HST
 *  base. They are what the rules say, whatever the platform did.
 *
 *  COLLECTED is a fact you read off the screenshot, and the three columns must
 *  satisfy taxes_collected = taxes_you_remit + taxes_platform_remits. You give
 *  the guest-paid tax total and the figure the platform passed through to you;
 *  what it kept is the difference. On Airbnb those two live on DIFFERENT TABS of
 *  the same modal, both labelled "Taxes", and taking the host one understates
 *  the collection — that misread is already in three saved rows.
 *
 *  THE PAYOUT IS CHECKED, NOT ASSUMED. accommodation − discount + cleaning +
 *  extras + passed-through tax − commission − processing must equal the payout
 *  on the screenshot. If it does not, something was misread, and this refuses to
 *  write rather than storing a booking whose arithmetic does not close. */

const n = (v: any) => { if (v === '' || v == null) return 0; const x = Number(v); return Number.isFinite(x) ? x : NaN }
const r2 = (v: number) => Math.round(v * 100) / 100

const ACCEPTED = new Set([
  'accommodation', 'cleaning', 'extras', 'discount',
  'commission', 'payment_processing_fee', 'payout_amount', 'guest_total',
  'taxes_collected', 'taxes_passed_through',
  'confirmation_code', 'guest_name', 'guest_email', 'guest_phone', 'guests', 'nightly_rate',
  'platform', 'guest_id', 'create_guest', 'preview', 'force',
])
const COMPUTED = ['hst', 'mat', 'taxes_you_remit', 'taxes_platform_remits', 'total']

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('money', 'edit')) return NextResponse.json({ error: 'Not allowed to record figures' }, { status: 403 })

  const { id } = await params
  const raw = await request.json().catch(() => null)
  if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 })

  const rejected = Object.keys(raw).filter(k => !ACCEPTED.has(k))
  const refusedComputed = rejected.filter(k => COMPUTED.includes(k))
  if (refusedComputed.length) {
    return NextResponse.json({
      error: 'HST, MAT and the remittance split are computed here, never supplied.',
      rejected: refusedComputed,
      hint: 'Send taxes_collected (guest-paid tab) and taxes_passed_through (host tab); the split follows.',
    }, { status: 400 })
  }
  if (rejected.length) return NextResponse.json({ error: 'Unexpected fields', rejected }, { status: 400 })

  const amounts = {
    accommodation: n(raw.accommodation), cleaning: n(raw.cleaning), extras: n(raw.extras),
    discount: n(raw.discount), commission: n(raw.commission),
    processing: n(raw.payment_processing_fee), payout: n(raw.payout_amount),
    guestTotal: n(raw.guest_total), collected: n(raw.taxes_collected), passed: n(raw.taxes_passed_through),
  }
  if (Object.values(amounts).some(Number.isNaN)) return NextResponse.json({ error: 'Amounts must be numbers.' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: b } = await supabase.from('calendar_blocks').select('*').eq('id', id).maybeSingle()
  if (!b) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (!b.start_date || !b.end_date) return NextResponse.json({ error: 'The row needs dates before tax can be worked out.' }, { status: 400 })

  const nights = Math.max(1, Math.round(
    (new Date(b.end_date + 'T00:00:00Z').getTime() - new Date(b.start_date + 'T00:00:00Z').getTime()) / 86400000))

  /* OWED — the rules, not the platform. */
  const split = computeTaxSplit({
    propertyId: b.property_id, checkIn: b.start_date, nights,
    accommodation: amounts.accommodation, discount: amounts.discount,
    cleaning: amounts.cleaning, hstTaxableExtras: amounts.extras,
  })
  const applyTax = b.apply_tax !== false
  const hst = applyTax ? split.hst : 0
  const mat = applyTax ? split.mat : 0

  /* COLLECTED — facts, and they must add up. */
  const platformKeeps = r2(amounts.collected - amounts.passed)
  if (platformKeeps < -0.005) {
    return NextResponse.json({
      error: 'The platform cannot pass through more tax than it collected.',
      taxes_collected: amounts.collected, taxes_passed_through: amounts.passed,
    }, { status: 400 })
  }

  /* THE PAYOUT CHECK. */
  const cashCalc = r2(amounts.accommodation - amounts.discount + amounts.cleaning + amounts.extras
    + amounts.passed - amounts.commission - amounts.processing)
  const payoutDelta = r2(cashCalc - amounts.payout)
  const reconciles = Math.abs(payoutDelta) <= 0.02

  const variance = r2(amounts.collected - (hst + mat))
  const after: Record<string, any> = {
    is_booking: true,
    accommodation: r2(amounts.accommodation), cleaning_fee: r2(amounts.cleaning),
    extras: r2(amounts.extras), discount: r2(amounts.discount),
    commission: r2(amounts.commission), payment_processing_fee: r2(amounts.processing),
    payout_amount: r2(amounts.payout), guest_total: r2(amounts.guestTotal),
    hst, mat,
    taxes_collected: r2(amounts.collected),
    taxes_you_remit: r2(amounts.passed),
    taxes_platform_remits: platformKeeps,
    tax_note: applyTax
      ? `Guest paid ${amounts.collected.toFixed(2)} tax; ${(hst + mat).toFixed(2)} owed under the rules `
        + `(${variance >= 0 ? 'over' : 'under'} by ${Math.abs(variance).toFixed(2)}). hst/mat are what is OWED.`
      : 'apply_tax is off for this booking, so HST and MAT are zero.',
  }
  for (const k of ['platform', 'confirmation_code', 'guest_name', 'nightly_rate', 'guests'] as const) {
    if (raw[k] != null && raw[k] !== '') after[k] = raw[k]
  }

  const before = Object.fromEntries(Object.keys(after).map(k => [k, (b as any)[k] ?? null]))
  const workings = {
    nights, apply_tax: applyTax, mat_rate: split.matRate, mat_exempt: split.matExempt,
    hst_base: applyTax ? split.hstBase : 0, owed: r2(hst + mat), collected: r2(amounts.collected), variance,
    payout_expected: cashCalc, payout_given: r2(amounts.payout), payout_delta: payoutDelta, reconciles,
  }

  /* THE GUEST LINK — the other thing a raw PATCH skips, and the one place
     resolveGuest is the wrong tool. It creates a guest when nothing matches,
     which is right for a booking form and wrong here: there are already two
     Molhem records, so an ambiguous name would silently mint a third. This
     links only on a CERTAIN match, and otherwise reports the candidates and
     leaves the booking unlinked for you to decide. */
  let guestId: string | null = b.guest_id ?? null
  let guest: any = { status: guestId ? 'already linked' : 'unlinked', guest_id: guestId }

  if (!guestId && raw.guest_id) {
    guestId = String(raw.guest_id); after.guest_id = guestId
    guest = { status: 'linked to the record you named', guest_id: guestId }
  } else if (!guestId) {
    const nameIn = (raw.guest_name ?? b.guest_name) as string | null
    const { data: all } = await supabase.from('guests').select('id, name, email, phone')
    const m = findGuest(all || [], { id: '', name: nameIn, email: raw.guest_email, phone: raw.guest_phone })

    if (m?.certain) {
      guestId = m.id; after.guest_id = m.id
      guest = { status: `linked on ${m.on}`, guest_id: m.id }
    } else {
      const tokens = nameTokens(nameIn)
      const near = (all || []).filter((g: any) => {
        const gn = normaliseName(g.name) || ''
        return tokens.length > 0 && tokens.some(t => t.length > 2 && gn.split(' ').includes(t))
      })
      if (m) {
        guest = { status: 'NOT LINKED — name-only match, confirm it is the same person',
          candidates: near.length ? near : [(all || []).find((g: any) => g.id === m.id)] }
      } else if (near.length) {
        guest = { status: 'NOT LINKED — no certain match, but these share a name', candidates: near }
      } else if (raw.create_guest === true && !raw.preview) {
        const { data: made } = await supabase.from('guests').insert({
          name: nameIn || null,
          ...splitName(nameIn),
          email: raw.guest_email || null,
          phone: raw.guest_phone || null,
        }).select('id').single()
        if (made) { guestId = made.id; after.guest_id = made.id; guest = { status: 'new guest created', guest_id: made.id } }
      } else {
        guest = { status: raw.create_guest === true
          ? 'nobody matches — a new guest will be created on write'
          : 'NOT LINKED — nobody matches; re-send with create_guest to add them' }
      }
    }
  }

  if (raw.preview) return NextResponse.json({ ok: true, preview: true, before, after, workings, guest })

  /* A booking whose payout will not close has been misread somewhere. Refuse
     unless the caller has seen the delta and said to write it anyway. */
  if (!reconciles && raw.force !== true) {
    return NextResponse.json({
      error: `The payout does not reconcile — computed ${cashCalc.toFixed(2)} against ${amounts.payout.toFixed(2)}, out by ${payoutDelta.toFixed(2)}.`,
      workings, before, after, guest,
    }, { status: 409 })
  }

  const { error } = await supabase.from('calendar_blocks').update(after).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, before, after, workings, guest, forced: !reconciles })
}
