import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'


export async function POST(request: NextRequest) {
  // Inserting rows into access_codes IS handing out access, so this is edit.
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('locks','edit')) return NextResponse.json({ error: 'Not allowed to issue access codes' }, { status: 403 })
  const { codes } = await request.json()
  const supabase = createAdminClient()
  const { error } = await supabase.from('access_codes').insert(codes)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
