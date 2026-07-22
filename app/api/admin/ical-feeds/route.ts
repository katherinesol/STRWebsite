import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

function detectPlatform(url: string): string {
  const u = url.toLowerCase()
  if (u.includes('airbnb')) return 'airbnb'
  if (u.includes('vrbo') || u.includes('homeaway')) return 'vrbo'
  if (u.includes('houfy')) return 'houfy'
  return 'other'
}

export async function GET() {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('ical_feeds').select('*').order('property_id').order('platform')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ feeds: data || [] })
}

export async function POST(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { property_id, url } = await request.json()
  if (!property_id || !url?.trim()) return NextResponse.json({ error: 'Property and URL required' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('ical_feeds').insert({ property_id, url: url.trim(), platform: detectPlatform(url) })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id, active } = await request.json()
  const supabase = createAdminClient()
  const { error } = await supabase.from('ical_feeds').update({ active }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id } = await request.json()
  const supabase = createAdminClient()
  const { error } = await supabase.from('ical_feeds').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
