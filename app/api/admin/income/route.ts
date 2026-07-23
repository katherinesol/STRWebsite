import { NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// Merged income rows from direct bookings + platform bookings, with data-quality flags.
export async function GET() {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()

  const { data: direct } = await supabase
    .from('bookings')
    .select('id, property_id, check_in, check_out, accommodation, cleaning_fee, addon_fee, hst, mat, total, status, tax_note, guest:guests(name)')
    .neq('status', 'cancelled')

  const { data: platform } = await supabase
    .from('calendar_blocks')
    .select('id, property_id, start_date, end_date, guest_name, platform, accommodation, cleaning_fee, taxes_collected, payout_amount, commission, discount, hst, mat, extras, tax_note')
    .eq('is_booking', true)

  const num = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v))

  const directRows = (direct || []).map((b: any) => {
    const acc = num(b.accommodation), clean = num(b.cleaning_fee)
    const hst = num(b.hst), mat = num(b.mat)
    const flags: string[] = []
    if (acc === null) flags.push('missing-amounts')
    if (hst === null && mat === null) flags.push('no-tax-recorded')
    return {
      id: b.id, source: 'direct', platform: 'direct',
      property_id: b.property_id, guest_name: b.guest?.name || 'Direct guest',
      check_in: b.check_in, check_out: b.check_out,
      accommodation: acc, cleaning_fee: clean,
      hst, mat, taxes_total: (hst || 0) + (mat || 0) || null, tax_collected: (hst || 0) + (mat || 0) || null,
      host_fee: null,
      discount: null,
      extras: num(b.addon_fee),
      payout: num(b.total),
      tax_note: b.tax_note || null,
      flags,
    }
  })

  const platformRows = (platform || []).map((b: any) => {
    const acc = num(b.accommodation), clean = num(b.cleaning_fee)
    const hst = num(b.hst), mat = num(b.mat)
    const split = (hst || 0) + (mat || 0)
    const taxes = split > 0 ? split : num(b.taxes_collected)
    const flags: string[] = []
    if (acc === null && num(b.payout_amount) === null) flags.push('missing-amounts')
    if (hst === null && mat === null) {
      if (num(b.taxes_collected) === null) flags.push('no-tax-recorded')
      else flags.push('tax-not-split')
    }
    return {
      id: b.id, source: 'platform', platform: b.platform || 'platform',
      property_id: b.property_id, guest_name: b.guest_name || 'Platform guest',
      check_in: b.start_date, check_out: b.end_date,
      accommodation: acc, cleaning_fee: clean,
      hst, mat, taxes_total: taxes, tax_collected: num(b.taxes_collected),
      host_fee: num(b.commission),
      discount: num(b.discount),
      extras: num(b.extras),
      payout: num(b.payout_amount),
      tax_note: b.tax_note || null,
      flags,
    }
  })

  const rows = [...directRows, ...platformRows].sort((a, b) => String(b.check_in).localeCompare(String(a.check_in)))
  return NextResponse.json({ rows })
}
