import { NextRequest, NextResponse } from 'next/server'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// GET: list media for a booking (with signed URLs)
export async function GET(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner', 'cleaner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const bookingId = request.nextUrl.searchParams.get('booking_id')
  if (!bookingId) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })
  const supabase = createAdminClient()
  const { data } = await supabase.from('booking_media').select('*').eq('booking_id', bookingId).order('created_at', { ascending: true })
  const media = []
  for (const m of data || []) {
    const { data: signed } = await supabase.storage.from('booking-media').createSignedUrl(m.storage_path, 3600)
    media.push({ ...m, url: signed?.signedUrl || null })
  }
  return NextResponse.json({ media })
}

// POST: upload one media file (multipart) → stores to bucket + records row
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner', 'cleaner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()
  const form = await request.formData()
  const file = form.get('file') as File | null
  const bookingId = form.get('booking_id') as string
  const bookingKind = (form.get('booking_kind') as string) || 'platform'
  const propertyId = form.get('property_id') as string
  const tag = (form.get('tag') as string) || 'after'
  const capturedAt = (form.get('captured_at') as string) || null
  if (!file || !bookingId) return NextResponse.json({ error: 'file and booking_id required' }, { status: 400 })

  const supabase = createAdminClient()
  const isVideo = file.type.startsWith('video/')
  const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')
  const path = `${propertyId || 'unknown'}/${bookingId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const bytes = await file.arrayBuffer()
  const { error: upErr } = await supabase.storage.from('booking-media').upload(path, bytes, { contentType: file.type })
  if (upErr) return NextResponse.json({ error: 'Upload failed: ' + upErr.message }, { status: 500 })

  const { data, error } = await supabase.from('booking_media').insert({
    booking_id: bookingId,
    booking_kind: bookingKind,
    property_id: propertyId || null,
    storage_path: path,
    media_type: isVideo ? 'video' : 'photo',
    tag,
    added_by: (auth as any)?.name || (auth as any)?.userId || null,
    captured_at: capturedAt,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id })
}

// DELETE: remove a media item
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
