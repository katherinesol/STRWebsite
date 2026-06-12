import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === process.env.ADMIN_SECRET
}

// upload one file
export async function POST(request: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const formData = await request.formData()
  const file = formData.get('file') as File
  const propertyId = formData.get('property_id') as string
  const tag = (formData.get('tag') as string) || 'living'
  if (!file || !propertyId) return NextResponse.json({ error: 'file and property_id required' }, { status: 400 })

  const supabase = createAdminClient()
  const isVideo = file.type.startsWith('video/')
  const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')
  const path = `${propertyId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const bytes = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('property-photos')
    .upload(path, bytes, { contentType: file.type })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // next sort order
  const { data: maxRow } = await supabase.from('property_photos')
    .select('sort_order').eq('property_id', propertyId)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await supabase.from('property_photos').insert({
    property_id: propertyId,
    storage_path: path,
    media_type: isVideo ? 'video' : 'image',
    tag: isVideo ? 'video' : tag,
    sort_order: (maxRow?.sort_order ?? -1) + 1,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: urlData } = supabase.storage.from('property-photos').getPublicUrl(path)
  return NextResponse.json({ photo: { ...data, url: urlData.publicUrl } })
}

// reorder: body { order: [photoId, photoId, ...] }
export async function PATCH(request: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { order } = await request.json()
  if (!Array.isArray(order)) return NextResponse.json({ error: 'order array required' }, { status: 400 })
  const supabase = createAdminClient()
  await Promise.all(order.map((id: string, i: number) =>
    supabase.from('property_photos').update({ sort_order: i }).eq('id', id)
  ))
  return NextResponse.json({ ok: true })
}
