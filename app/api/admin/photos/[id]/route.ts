import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed } from '@/lib/auth'


// update tag / cover
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json()
  const supabase = createAdminClient()

  if (body.is_cover === true) {
    // only one cover per property
    const { data: photo } = await supabase.from('property_photos').select('property_id').eq('id', id).single()
    if (photo) {
      await supabase.from('property_photos').update({ is_cover: false }).eq('property_id', photo.property_id)
    }
  }

  const { error } = await supabase.from('property_photos').update(body).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()
  const { data: photo } = await supabase.from('property_photos').select('storage_path').eq('id', id).single()
  if (photo) {
    await supabase.storage.from('property-photos').remove([photo.storage_path])
  }
  const { error } = await supabase.from('property_photos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
