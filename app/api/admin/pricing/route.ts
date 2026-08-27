import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'


// update base config
export async function PATCH(request: NextRequest) {
  // Every method here writes a rate: PATCH upserts property_pricing, POST inserts an
  // override, DELETE removes one. Setting what a stay costs is money, edit.
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('money', 'edit')) return NextResponse.json({ error: 'Not allowed to change pricing' }, { status: 403 })
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
  // Every method here writes a rate: PATCH upserts property_pricing, POST inserts an
  // override, DELETE removes one. Setting what a stay costs is money, edit.
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('money', 'edit')) return NextResponse.json({ error: 'Not allowed to change pricing' }, { status: 403 })
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
  // Every method here writes a rate: PATCH upserts property_pricing, POST inserts an
  // override, DELETE removes one. Setting what a stay costs is money, edit.
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('money', 'edit')) return NextResponse.json({ error: 'Not allowed to change pricing' }, { status: 403 })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('pricing_overrides').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
