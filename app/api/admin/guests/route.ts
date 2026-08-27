import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { splitName } from '@/lib/keyholder/guest-match'
import { hasRole, hasPermission } from '@/lib/auth'


/* Guest records are the most personal table here — names, email addresses,
 * phone numbers and free-text notes. Every route on it was isAuthed(), so any
 * signed-in account could pull the whole list. Same hole as the booking PATCH,
 * closed the same way. */
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('guests', 'edit')) return NextResponse.json({ error: 'Not allowed to change guest records' }, { status: 403 })
  const { name, email, phone } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const supabase = createAdminClient()

  // check for existing guest with exact name
  const { data: existing } = await supabase.from('guests').select('id, name').eq('name', name.trim()).maybeSingle()
  if (existing) {
    return NextResponse.json({ error: `Guest "${existing.name}" already exists`, guest: existing }, { status: 409 })
  }

  const { data, error } = await supabase.from('guests').insert({
    ...splitName(name),
    name: name.trim(),
    email: email || null,
    phone: phone || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ guest: data })
}
