import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed } from '@/lib/auth'
import { pick, rejection } from '@/lib/allowlist'


export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  /*  property_id is absent from this list ON PURPOSE. The URL says which
      property is being edited and the WHERE clause pins it, but a spread body
      could also SET it - reassigning one property's settings onto another in a
      single request, with the URL still reading correctly. */
  const ALLOWED = [
    'nightly_rate', 'cleaning_fee', 'earliest_checkin', 'latest_checkout',
    'min_stay', 'max_advance_days', 'early_checkin_fee_per_hour',
    'late_checkout_fee_per_hour', 'parking_spots', 'bag_drop_available',
    'instacart_available', 'security_deposit_amount',
    'referral_reward_referrer', 'referral_reward_referred',
    'schlage_devices', 'cleaning_duration_mins',
  ] as const
  const p = pick(await request.json(), ALLOWED)
  if (!p.ok) return NextResponse.json(rejection(p.rejected, ALLOWED), { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('property_settings')
    .update({ ...p.fields, updated_at: new Date().toISOString() })
    .eq('property_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
