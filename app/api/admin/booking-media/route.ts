import { NextRequest, NextResponse } from 'next/server'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

/*  Photos and video attached to a stay.
 *
 *  ROLE-ONLY, DELIBERATELY. There is no permission category that fits: these are
 *  photos of a STAY, not of the listing, so `property` would either lock cleaners
 *  out of the walkthrough that is their job or hand them a category they should
 *  not otherwise hold. The role floor already says the real rule - a cleaner may
 *  ADD evidence and may not REMOVE it, which is the right asymmetry for a record
 *  that exists to settle a dispute.
 *
 *  KNOWN LOOSENESS: GET scopes by booking_id only, so a cleaner can list the
 *  media of a stay they did not work. Left as-is because scoping it needs a
 *  cleaner-to-stay assignment this schema has no notion of. Recorded in the
 *  backlog rather than pretended away.
 */

// GET: list media for a booking (with signed read URLs)
export async function GET(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner', 'cleaner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const bookingId = request.nextUrl.searchParams.get('booking_id')
  if (!bookingId) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data } = await supabase.from('booking_media').select('*')
    .eq('booking_id', bookingId).order('captured_at', { ascending: true, nullsFirst: false })

  const media = []
  for (const m of data || []) {
    const { data: signed } = await supabase.storage.from('booking-media').createSignedUrl(m.storage_path, 3600)
    media.push({ ...m, url: signed?.signedUrl || null })
  }
  return NextResponse.json({ media })
}

/*  POST: hand back a signed upload URL. The browser then PUTs the file straight
 *  to storage and calls PATCH below to record the row.
 *
 *  IT USED TO STREAM THE BYTES THROUGH THIS ROUTE - request.formData(), then
 *  upload(path, bytes) - which is exactly what broke the guest guide at 9.8MB
 *  and had to be rewritten. A phone photo is 3-5MB and a walkthrough is twenty to
 *  forty of them, so the old shape worked for a test file and would have failed
 *  the first real walk of a property. guest-guide's PUT is the working precedent
 *  and this follows it.
 *
 *  THE PATH IS BUILT HERE, NOT BY THE CALLER. A client-chosen path could write
 *  anywhere in the bucket, including over another booking's evidence. */
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner', 'cleaner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  const { booking_id, property_id, filename, content_type } = await request.json().catch(() => ({} as any))
  if (!booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })

  const isVideo = String(content_type || '').startsWith('video/')
  const ext = (String(filename || '').split('.').pop() || (isVideo ? 'mp4' : 'jpg'))
    .toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg'
  const path = `${property_id || 'unknown'}/${booking_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from('booking-media').createSignedUploadUrl(path)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ token: data.token, path: data.path, signedUrl: data.signedUrl })
}

/*  PATCH: record the row once the browser's upload has landed.
 *
 *  SEPARATE FROM THE UPLOAD ON PURPOSE. If this fails, the object is in the
 *  bucket without a row - orphaned bytes, which cost storage and nothing else.
 *  Were it the other way round, a row would point at an object that never
 *  arrived and the gallery would show a permanent broken frame. Of the two
 *  failures, the recoverable one is chosen.
 *
 *  captured_at COMES FROM THE FILE, NOT THE CLOCK. The browser sends
 *  File.lastModified. A photo taken in a basement with no signal and uploaded
 *  forty minutes later must keep the moment it was taken - that timestamp is the
 *  entire evidentiary point. created_at records arrival separately; they are
 *  different facts and the table has room for both. */
const TAGS = ['before', 'after', 'issue']

export async function PATCH(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner', 'cleaner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()

  const b = await request.json().catch(() => ({} as any))
  const { booking_id, booking_kind, property_id, storage_path, content_type, captured_at, tag } = b
  if (!booking_id || !storage_path) {
    return NextResponse.json({ error: 'booking_id and storage_path required' }, { status: 400 })
  }
  if (tag && !TAGS.includes(tag)) {
    return NextResponse.json({ error: `tag must be one of: ${TAGS.join(', ')}`, rejected: tag }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.from('booking_media').insert({
    booking_id,
    booking_kind: booking_kind === 'direct' ? 'direct' : 'platform',
    property_id: property_id || null,
    storage_path,
    media_type: String(content_type || '').startsWith('video/') ? 'video' : 'photo',
    tag: tag || 'before',
    added_by: (auth as any)?.name || (auth as any)?.userId || null,
    captured_at: captured_at ? new Date(captured_at).toISOString() : null,
  }).select('id, storage_path, tag, media_type, captured_at, added_by').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, media: data })
}

// DELETE: owner and co-owner only. A cleaner adds evidence; they do not remove it.
export async function DELETE(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: m } = await supabase.from('booking_media').select('storage_path').eq('id', id).single()
  if (m?.storage_path) await supabase.storage.from('booking-media').remove([m.storage_path])
  await supabase.from('booking_media').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
