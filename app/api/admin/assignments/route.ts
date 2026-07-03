import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// list all assignments — owner only
export async function GET() {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('property_assignments')
    .select('id, property_id, user_id, profiles:user_id(name, email, role)')
  return NextResponse.json({ assignments: data || [] })
}

// assign a cleaner to a property — owner only
export async function POST(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  const { user_id, property_id } = await request.json()
  if (!user_id || !property_id) return NextResponse.json({ error: 'user_id and property_id required' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('property_assignments').insert({ user_id, property_id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// remove an assignment — owner only
export async function DELETE(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('property_assignments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
