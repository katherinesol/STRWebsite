import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed, hasRole } from '@/lib/auth'

// Private gift notes. ADMIN-ONLY — this is surprise data the guest must never see,
// which is why it lives in its own table rather than on the booking row.
// Gated to owner/co-owner so cleaning staff with admin access cannot read it.

const KINDS = ['direct', 'platform']

async function gate() {
  if (!await isAuthed()) return false
  return hasRole('co-owner')   // hasRole() returns true for 'owner' automatically
}

export async function GET(request: NextRequest) {
  if (!await gate()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = request.nextUrl.searchParams
  const booking_id = sp.get('booking_id') || ''
  const booking_kind = sp.get('booking_kind') || ''
  if (!booking_id || !KINDS.includes(booking_kind)) {
    return NextResponse.json({ error: 'booking_id and booking_kind required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: gift } = await supabase
    .from('booking_gifts')
    .select('*')
    .eq('booking_id', booking_id)
    .eq('booking_kind', booking_kind)
    .maybeSingle()

  // pull the linked expense so the card can show what was already logged
  let expense = null
  if (gift?.expense_id) {
    const { data } = await supabase
      .from('expenses')
      .select('id, date, vendor, amount, category, description, receipt_path')
      .eq('id', gift.expense_id)
      .maybeSingle()
    expense = data
  }

  return NextResponse.json({ gift: gift || null, expense })
}

// Upsert the note. Deliberately does NOT touch an already-logged expense —
// expenses are financial records, not notes.
export async function POST(request: NextRequest) {
  if (!await gate()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const booking_id = String(body?.booking_id || '')
  const booking_kind = String(body?.booking_kind || '')
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 2000) : ''

  if (!booking_id || !KINDS.includes(booking_kind)) {
    return NextResponse.json({ error: 'booking_id and booking_kind required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('booking_gifts')
    .upsert(
      { booking_id, booking_kind, note: note || null, updated_at: new Date().toISOString() },
      { onConflict: 'booking_id,booking_kind' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, gift: data })
}
