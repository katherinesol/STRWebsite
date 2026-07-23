import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

const n = (v: any) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v))

export async function PATCH(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id, source, accommodation, cleaning_fee, discount, hst, mat, payout, host_fee } = await request.json()
  if (!id || !source) return NextResponse.json({ error: 'id and source required' }, { status: 400 })
  const supabase = createAdminClient()

  if (source === 'direct') {
    const { error } = await supabase.from('bookings').update({
      accommodation: n(accommodation), cleaning_fee: n(cleaning_fee),
      hst: n(hst), mat: n(mat), total: n(payout),
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const h = n(hst), m = n(mat)
    const { error } = await supabase.from('calendar_blocks').update({
      accommodation: n(accommodation), cleaning_fee: n(cleaning_fee), discount: n(discount),
      hst: h, mat: m,
      taxes_collected: (h || 0) + (m || 0) || null,
      payout_amount: n(payout), commission: n(host_fee),
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
