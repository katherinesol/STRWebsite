import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed } from '@/lib/auth'
import { pick, rejection } from '@/lib/allowlist'


export async function POST(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ALLOWED = [
    'booking_id', 'property_id', 'item', 'location', 'description',
    'photo_urls', 'amount_claimed', 'linked_to_deposit',
  ] as const
  const p = pick(await request.json(), ALLOWED)
  if (!p.ok) return NextResponse.json(rejection(p.rejected, ALLOWED), { status: 400 })
  if (!p.fields.property_id || !p.fields.item) {
    return NextResponse.json({ error: 'A damage report needs a property and an item.' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from('damage_reports').insert(p.fields)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
