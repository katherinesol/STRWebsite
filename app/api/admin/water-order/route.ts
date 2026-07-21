import { NextRequest, NextResponse } from 'next/server'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// get current open order + list of past companies (for the dropdown)
export async function GET() {
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()

  const [{ data: open }, { data: all }] = await Promise.all([
    supabase.from('water_orders').select('*').eq('delivered', false).order('ordered_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('water_orders').select('company'),
  ])
  const companies = Array.from(new Set((all || []).map(w => w.company).filter(Boolean)))
  return NextResponse.json({ open: open || null, companies })
}

// record a water order — owner + co-owner
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()
  const { company, expected_date, property_id } = await request.json()
  const supabase = createAdminClient()
  const { error } = await supabase.from('water_orders').insert({
    property_id: property_id || 'nickel-beach',
    company: company || null,
    expected_date: expected_date || null,
    ordered_by: auth.ok ? auth.userId : null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// mark delivered — owner + co-owner
export async function PATCH(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('water_orders').update({ delivered: true, delivered_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
