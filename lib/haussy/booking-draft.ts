// Pricing for a proposed booking. Pure — no database, no auth — so the confirm
// card, the commit path and the tests all run the identical arithmetic.
//
// Tax comes from lib/tax-rates.ts and nowhere else. The legacy Haussy path wrote
// taxes_collected and left hst, mat, apply_tax and taxes_you_remit null on every
// booking it created; that is the defect this module exists to make impossible.
// Stored figures are what is OWED under the rules, never what a platform
// happened to collect.

import { computeTaxSplit, remittanceSplit } from '@/lib/tax-rates'
import { resolveApplyTax, taxToggleExplainer, type BookingSource } from '@/lib/booking-tax'

export const PROPS = ['royal-york-east', 'royal-york-west', 'nickel-beach']
const DATE = /^\d{4}-\d{2}-\d{2}$/

export const r2 = (v: number) => Math.round(v * 100) / 100
export const n = (v: unknown) => (v == null || v === '' ? 0 : Number(v) || 0)
export const nOrNull = (v: unknown) => (v == null || v === '' ? null : Number(v) || 0)

export function nightsBetween(a: string, b: string): number {
  const ms = new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()
  return Math.max(0, Math.round(ms / 86400000))
}

export type Priced = ReturnType<typeof priceBooking>

export function priceBooking(d: any) {
  const kind: BookingSource = d.kind === 'direct' ? 'direct' : 'platform'
  const property_id = String(d.property_id || '')
  const check_in = String(d.check_in || '').slice(0, 10)
  const check_out = String(d.check_out || '').slice(0, 10)
  const platform = kind === 'platform' ? (String(d.platform || 'other').toLowerCase() || 'other') : null

  if (!PROPS.includes(property_id)) return { error: 'Pick a property' as const }
  if (!DATE.test(check_in) || !DATE.test(check_out)) return { error: 'Check-in and check-out dates are required' as const }
  const nights = nightsBetween(check_in, check_out)
  if (nights < 1) return { error: 'Check-out must be after check-in' as const }

  const accommodation = n(d.accommodation) || r2(n(d.nightly_rate) * nights)
  const cleaning = n(d.cleaning_fee)
  const extras = n(d.extras)
  const discount = n(d.discount)

  // Extras sit OUTSIDE both bases: never MAT (room only), and per the settled
  // Port Colborne answer not part of the accommodation supply for HST either.
  // Passed explicitly because computeTaxSplit refuses to imply the choice.
  const applyTax = resolveApplyTax(d.apply_tax == null ? null : Boolean(d.apply_tax), kind, platform)
  const split = computeTaxSplit({
    propertyId: property_id, checkIn: check_in, nights,
    accommodation, discount, cleaning, hstTaxableExtras: 0,
  })
  const remit = remittanceSplit(platform, split)

  const hst = applyTax ? split.hst : 0
  const mat = applyTax ? split.mat : 0
  const owed = r2(hst + mat)
  const youRemit = applyTax ? remit.youRemit : 0
  const platformRemits = applyTax ? remit.platformRemits : 0

  // bookings.guests is NOT NULL. A stay has at least one guest, so assume 1 when
  // the owner did not say — but flag it, so the card states the assumption rather
  // than quietly inventing occupancy on a record used for pricing and cleaning.
  const guestsStated = nOrNull(d.guests_count)
  const guestsCount = guestsStated ?? 1
  const guestsAssumed = guestsStated == null

  const collectedGiven = nOrNull(d.taxes_collected ?? d.occupancy_taxes)
  const variance = collectedGiven == null ? null : r2(collectedGiven - owed)

  const commission = n(d.commission)
  const processing = n(d.payment_processing_fee)
  const platformLabel = (platform || 'platform').charAt(0).toUpperCase() + (platform || 'platform').slice(1)
  const ref = d.confirmation_code ? ` · ${d.confirmation_code}` : ''
  const who = d.guest_name || 'guest'
  const expenses = kind === 'platform' ? [
    commission > 0 && { key: 'commission', amount: commission, description: 'Platform host fee',
      notes: `Host fee / commission — ${platformLabel} booking, ${who}${ref}` },
    processing > 0 && { key: 'processing', amount: processing, description: 'Platform payment processing fee',
      notes: `Payment processing fee — ${platformLabel} booking, ${who}${ref}` },
  ].filter(Boolean) as any[] : []

  return {
    error: null as null, kind, property_id, platform, platformLabel, check_in, check_out, nights,
    guests: guestsCount, guests_assumed: guestsAssumed,
    money: { accommodation, discount, cleaning, extras, room: split.room,
             guest_total: r2(accommodation - discount + cleaning + extras + owed) },
    tax: {
      apply_tax: applyTax, explainer: taxToggleExplainer(applyTax, kind, platform),
      mat_rate: split.matRate, mat_exempt: split.matExempt,
      mat, hst, hst_base: applyTax ? split.hstBase : 0, owed,
      you_remit: youRemit, platform_remits: platformRemits,
      collected_reported: collectedGiven, variance,
    },
    expenses,
  }
}

/** The tax_note recording a platform under/over-collection, or null. */
export function taxNoteFor(p: Priced): string | null {
  if (p.error) return null
  const { collected_reported, variance, owed } = p.tax
  if (variance == null || Math.abs(variance) <= 0.005) return null
  return `Platform reported ${collected_reported!.toFixed(2)} collected; ${owed.toFixed(2)} owed under the rules (variance ${variance.toFixed(2)}). Stored figures are what is owed.`
}

/** Column map for the target table. Every tax column is written, always. */
export function buildBookingColumns(d: any, p: Priced) {
  if (p.error) throw new Error(p.error)
  const t = p.tax, m = p.money
  const taxNote = taxNoteFor(p)

  if (p.kind === 'platform') {
    return {
      property_id: p.property_id, start_date: p.check_in, end_date: p.check_out,
      reason: 'manual', platform: p.platform,
      guest_name: d.guest_name || null, guest_email: d.guest_email || null, guest_phone: d.guest_phone || null,
      guests: p.guests,
      nightly_rate: nOrNull(d.nightly_rate), accommodation: m.accommodation,
      cleaning_fee: m.cleaning, extras: m.extras, discount: m.discount,
      taxes_collected: t.apply_tax ? (t.collected_reported ?? t.owed) : nOrNull(d.taxes_collected),
      taxes_you_remit: t.you_remit, taxes_platform_remits: t.platform_remits,
      hst: t.hst, mat: t.mat, apply_tax: t.apply_tax, tax_note: taxNote,
      guest_total: nOrNull(d.guest_total) ?? m.guest_total,
      payout_amount: nOrNull(d.payout_amount),
      commission: nOrNull(d.commission), payment_processing_fee: nOrNull(d.payment_processing_fee),
      confirmation_code: d.confirmation_code || null,
      early_checkin_time: d.check_in_time || null, late_checkout_time: d.check_out_time || null,
      door_code: d.door_code || null,
      trip_purpose: d.trip_purpose || null, trip_purpose_note: d.trip_purpose_note || null,
      notes: d.notes || 'Added by Haussy',
    }
  }
  return {
    property_id: p.property_id, check_in: p.check_in, check_out: p.check_out,
    nights: p.nights, guests: p.guests,
    guests_adults: nOrNull(d.guests_adults), guests_children: nOrNull(d.guests_children),
    status: 'confirmed', payment_method: d.payment_method || null,
    accommodation: m.accommodation, cleaning_fee: m.cleaning, addon_fee: m.extras,
    hst: t.hst, mat: t.mat, apply_tax: t.apply_tax, tax_note: taxNote,
    total: m.guest_total,
    confirmation_code: d.confirmation_code || null, booking_reference: d.booking_reference || null,
    early_checkin_time: d.check_in_time || null, late_checkout_time: d.check_out_time || null,
    trip_purpose: d.trip_purpose || null, trip_purpose_note: d.trip_purpose_note || null,
  }
}

export function buildExpenseRows(p: Priced, expenseIds: string[]) {
  if (p.error) return []
  return p.expenses.map((e, i) => ({
    id: expenseIds[i], property_id: p.property_id, date: p.check_in,
    vendor: p.platformLabel, description: e.description, amount: e.amount,
    category: 'Management & administration fees', notes: e.notes,
    ai_extracted: true, confirmed: false,
  }))
}
