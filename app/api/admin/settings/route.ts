import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole } from '@/lib/auth'


export async function PATCH(request: NextRequest) {
  /*  OWNER ONLY, not money.
   *
   *  admin_settings is a one-row system singleton - today just
   *  referral_reward_amount - and it is a grab-bag that will collect settings
   *  which have nothing to do with money. Gating it by the money category would
   *  mislabel it permanently and would let a money:'edit' co-owner reconfigure
   *  the system, which is a different authority from recording an expense.
   *
   *  /admin/users, /admin/staff-access and /admin/system-log are all
   *  hasRole('owner') for the same reason; this follows them. Flagged as the one
   *  judgement call in tier 2 - if the referral amount should instead be
   *  money:'edit', it is a one-line change. */
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  const body = await request.json()
  const supabase = createAdminClient()
  const { error } = await supabase.from('admin_settings').update({ ...body, updated_at: new Date().toISOString() }).eq('id', 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
