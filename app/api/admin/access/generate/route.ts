import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'
import { pick, rejection } from '@/lib/allowlist'


export async function POST(request: NextRequest) {
  // Inserting rows into access_codes IS handing out access, so this is edit.
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('locks','edit')) return NextResponse.json({ error: 'Not allowed to issue access codes' }, { status: 403 })
  /*  An ARRAY, so every element is allowlisted, not just the envelope.
      revoked_at is the one to keep out: settable, it mints a code that is dead
      on arrival; and a caller could otherwise send id or generated_at too. */
  const { codes } = await request.json().catch(() => ({ codes: null }))
  if (!Array.isArray(codes) || codes.length === 0) {
    return NextResponse.json({ error: 'codes must be a non-empty array' }, { status: 400 })
  }
  const ALLOWED = ['booking_id', 'property_id', 'code', 'notes'] as const
  const rows: any[] = []
  for (let i = 0; i < codes.length; i++) {
    const p = pick(codes[i], ALLOWED)
    if (!p.ok) return NextResponse.json({ ...rejection(p.rejected, ALLOWED), at_index: i }, { status: 400 })
    if (!p.fields.property_id || !p.fields.code) {
      return NextResponse.json({ error: 'Each code needs a property_id and a code', at_index: i }, { status: 400 })
    }
    rows.push(p.fields)
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from('access_codes').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
