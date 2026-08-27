import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'


export async function POST(request: NextRequest) {
  // property_guides is per-property content (sections, titles, body), not guest data
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('property', 'edit')) return NextResponse.json({ error: 'Not allowed to change property guides' }, { status: 403 })
  const body = await request.json()
  const supabase = createAdminClient()
  const { data: guide, error } = await supabase.from('property_guides').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ guide })
}
