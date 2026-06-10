import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === process.env.ADMIN_SECRET
}

export async function POST(request: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const formData = await request.formData()
  const supabase = createAdminClient()

  const supply_id = formData.get('supply_id') as string
  const property_id = formData.get('property_id') as string
  const action = formData.get('action') as string
  const quantity_change = parseInt(formData.get('quantity_change') as string) || 0
  const note = formData.get('note') as string
  const logged_by = formData.get('logged_by') as string
  const photo = formData.get('photo') as File | null

  let photo_url = null

  // upload photo to Supabase Storage if provided
  if (photo && photo.size > 0) {
    const ext = photo.name.split('.').pop()
    const path = `supply-logs/${supply_id}/${Date.now()}.${ext}`
    const { data: uploadData } = await supabase.storage
      .from('property-management')
      .upload(path, photo, { contentType: photo.type })
    if (uploadData) {
      const { data: urlData } = supabase.storage.from('property-management').getPublicUrl(path)
      photo_url = urlData.publicUrl
    }
  }

  // log the action
  await supabase.from('supply_logs').insert({
    supply_id, property_id, action, quantity_change, note, photo_url, logged_by,
  })

  // update quantity if restocking
  if (action === 'restocked' && quantity_change > 0) {
    const { data: supply } = await supabase.from('supplies').select('quantity_on_hand').eq('id', supply_id).single()
    if (supply) {
      await supabase.from('supplies').update({
        quantity_on_hand: (supply.quantity_on_hand || 0) + quantity_change,
      }).eq('id', supply_id)
    }
  }

  return NextResponse.json({ ok: true })
}
