import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'


export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  /*  PROPERTY, not guests, and it is a judgement call. A review row is
      public-facing listing content - rating, body, published, host_reply - and
      editing one is publishing or replying. It carries a guest_name string but
      no guest record, so it is not guest data in the sense the guests category
      protects. */
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('property', 'edit')) return NextResponse.json({ error: 'Not allowed to change reviews' }, { status: 403 })
  const { id } = await params
  const body = await request.json()
  const supabase = createAdminClient()
  const { error } = await supabase.from('reviews').update(body).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
