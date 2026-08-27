import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'


export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Revoking takes a guest's access away — a change to who can open a door.
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('locks','edit')) return NextResponse.json({ error: 'Not allowed to revoke access codes' }, { status: 403 })
  const { id } = await params
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('access_codes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.redirect(new URL('/admin/access', _request.url))
}
