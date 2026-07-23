import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

const n = (v: any) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v))

export async function PATCH(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id, source, accommodation, cleaning_fee, discount, extras, hst, mat, payout, host_fee, tax_note, tax_collected, processing_fee } = await request.json()
  if (!id || !source) return NextResponse.json({ error: 'id and source required' }, { status: 400 })
  const supabase = createAdminClient()

  if (source === 'direct') {
    const { error } = await supabase.from('bookings').update({
      accommodation: n(accommodation), cleaning_fee: n(cleaning_fee), addon_fee: n(extras),
      hst: n(hst), mat: n(mat), total: n(payout), tax_note: tax_note || null,
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const h = n(hst), m = n(mat)
    const { error } = await supabase.from('calendar_blocks').update({
      accommodation: n(accommodation), cleaning_fee: n(cleaning_fee), discount: n(discount), extras: n(extras),
      hst: h, mat: m,
      taxes_collected: n(tax_collected),
      payout_amount: n(payout), commission: n(host_fee), payment_processing_fee: n(processing_fee), tax_note: tax_note || null,
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
