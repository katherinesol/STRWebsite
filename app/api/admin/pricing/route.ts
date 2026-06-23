import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed } from '@/lib/auth'


// update base config
export async function PATCH(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { property_id, ...fields } = body
  if (!property_id) return NextResponse.json({ error: 'property_id required' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('property_pricing')
    .upsert({ property_id, ...fields, updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// add override
export async function POST(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  if (!body.property_id || !body.start_date || !body.end_date) {
    return NextResponse.json({ error: 'property_id, start_date, end_date required' }, { status: 400 })
  }
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('pricing_overrides').insert({
    property_id: body.property_id,
    start_date: body.start_date,
    end_date: body.end_date,
    rate: body.rate || null,
    min_stay: body.min_stay || null,
    label: body.label || null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ override: data })
}

// delete override
export async function DELETE(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('pricing_overrides').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
