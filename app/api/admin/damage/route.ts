import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuth } from '@/lib/auth'
import { requireArea } from '@/lib/require-area'
import { pick, rejection } from '@/lib/allowlist'

/*  Damage reports: filed against a stay, argued from photographs.
 *
 *  THE OLD HANDLER WROTE FIVE COLUMNS THAT DO NOT EXIST. item, location,
 *  photo_urls, amount_claimed and linked_to_deposit were all absent from the
 *  live table, so the insert failed with 42703 on every submission and the form
 *  swallowed it. See supabase/damage_rebuild.sql -- the table is now reconciled
 *  and `location` is `room`, the word damage_items already uses.
 *
 *  STATUS IS A LIFECYCLE, NOT A FLAG. pending -> approved -> fixed, with
 *  dismissed as the exit. The table already carried approved_by/approved_at and
 *  fixed_at and nothing ever set them; PATCH stamps them now, so the record says
 *  who decided and when rather than just what the current value is.
 *
 *  DISMISS, DO NOT DELETE. A withdrawn claim is a fact about the stay worth
 *  keeping -- including when the photos showed the damage was already there.
 *  DELETE exists for a genuine misfile and takes the photos off the report
 *  without destroying them (the FK is ON DELETE SET NULL).
 *
 *  NOTHING HERE TOUCHES THE P&L. A damage claim is a dispute with a guest, not
 *  revenue; it reaches the books only if and when money actually moves, through
 *  the deposit. linked_to_deposit records the intent and moves nothing. */

const ALLOWED = [
  'booking_id', 'booking_kind', 'property_id', 'item', 'room',
  'description', 'amount_claimed', 'linked_to_deposit', 'item_id',
] as const

const PATCHABLE = [...ALLOWED, 'status'] as const
const STATUSES = ['pending', 'approved', 'fixed', 'dismissed']

/** Signed read URLs for the photos attached to these reports. Signed, so they
 *  cannot be cached anywhere useful and expire in an hour. */
async function photosFor(supabase: any, reportIds: string[]) {
  const byReport: Record<string, any[]> = {}
  if (!reportIds.length) return byReport
  const { data } = await supabase.from('booking_media')
    .select('id, report_id, storage_path, media_type, tag, captured_at, created_at, added_by')
    .in('report_id', reportIds)
    .order('captured_at', { ascending: true, nullsFirst: false })
  for (const m of data || []) {
    const { data: signed } = await supabase.storage.from('booking-media').createSignedUrl(m.storage_path, 3600)
    ;(byReport[m.report_id] ||= []).push({ ...m, url: signed?.signedUrl || null })
  }
  return byReport
}

// GET: reports for one stay (booking_id) or, with no filter, all of them.
export async function GET(request: NextRequest) {
  const no = await requireArea('damage', 'view')
  if (no) return no

  const bookingId = request.nextUrl.searchParams.get('booking_id')
  const propertyId = request.nextUrl.searchParams.get('property_id')

  const supabase = createAdminClient()
  let q = supabase.from('damage_reports')
    .select('*, damage_items(name, room)')
    .order('logged_at', { ascending: false })
  if (bookingId) q = q.eq('booking_id', bookingId)
  if (propertyId) q = q.eq('property_id', propertyId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const photos = await photosFor(supabase, (data || []).map(r => r.id))
  return NextResponse.json({
    reports: (data || []).map(r => ({ ...r, photos: photos[r.id] || [] })),
  })
}

export async function POST(request: NextRequest) {
  const no = await requireArea('damage', 'edit')
  if (no) return no

  const p = pick(await request.json().catch(() => null), ALLOWED)
  if (!p.ok) return NextResponse.json(rejection(p.rejected, ALLOWED), { status: 400 })

  const f = p.fields
  if (!f.property_id || !String(f.item || '').trim()) {
    return NextResponse.json({ error: 'A damage report needs a property and an item.' }, { status: 400 })
  }
  if (f.booking_kind && !['direct', 'platform'].includes(f.booking_kind)) {
    return NextResponse.json({ error: 'booking_kind must be direct or platform' }, { status: 400 })
  }

  const auth = await getAuth()
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('damage_reports').insert({
    ...f,
    item: String(f.item).trim(),
    room: f.room ? String(f.room).trim() : null,
    booking_id: f.booking_id || null,
    amount_claimed: f.amount_claimed === '' || f.amount_claimed == null ? null : Number(f.amount_claimed),
    logged_by: (auth as any)?.name || (auth as any)?.userId || null,
  }).select('id').single()

  /*  The id goes back because the photo uploader needs it: the browser attaches
      the shots to the report it just created. The old form had no id to return
      and no photos to attach, which is the same gap seen from the other end. */
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function PATCH(request: NextRequest) {
  const no = await requireArea('damage', 'edit')
  if (no) return no

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const p = pick(await request.json().catch(() => null), PATCHABLE)
  if (!p.ok) return NextResponse.json(rejection(p.rejected, PATCHABLE), { status: 400 })

  const patch: Record<string, any> = { ...p.fields }
  if ('status' in patch) {
    if (!STATUSES.includes(patch.status)) {
      return NextResponse.json({ error: `status must be one of: ${STATUSES.join(', ')}` }, { status: 400 })
    }
    const auth = await getAuth()
    const who = (auth as any)?.name || (auth as any)?.userId || null
    // Who decided, and when — the columns existed and nothing ever filled them.
    if (patch.status === 'approved') { patch.approved_by = who; patch.approved_at = new Date().toISOString() }
    if (patch.status === 'fixed') { patch.fixed_at = new Date().toISOString() }
  }
  if ('item' in patch && !String(patch.item || '').trim()) {
    return NextResponse.json({ error: 'A report cannot lose its item.' }, { status: 400 })
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase.from('damage_reports').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/*  A misfile, not a withdrawal — withdrawal is status 'dismissed'. The photos
 *  survive: report_id goes null and they stay in the stay's walkthrough, which
 *  is where they belonged before anyone attached them to a claim. */
export async function DELETE(request: NextRequest) {
  const no = await requireArea('damage', 'edit')
  if (no) return no

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase.from('damage_reports').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
