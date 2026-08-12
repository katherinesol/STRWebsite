import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { extendCodeForStayGroup } from '@/lib/stay-groups'

// GET ?booking_id=&booking_kind=  → the stay group this booking belongs to (if any)
export async function GET(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const sp = request.nextUrl.searchParams
  const bookingId = sp.get('booking_id')
  const bookingKind = sp.get('booking_kind') || 'platform'
  if (!bookingId) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })
  const supabase = createAdminClient()

  const { data: member } = await supabase.from('stay_group_members')
    .select('group_id').eq('booking_id', bookingId).eq('booking_kind', bookingKind).maybeSingle()
  if (!member) return NextResponse.json({ group: null })

  const { data: group } = await supabase.from('stay_groups').select('*').eq('id', member.group_id).maybeSingle()
  const { data: members } = await supabase.from('stay_group_members').select('*').eq('group_id', member.group_id)
  return NextResponse.json({ group, members: members || [] })
}

// POST link an extension to an original: { original_id, original_kind, extension_id, extension_kind, property_id, guest_name }
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const b = await request.json()
  const { original_id, original_kind, extension_id, extension_kind, property_id, guest_name } = b
  if (!original_id || !extension_id) return NextResponse.json({ error: 'original_id and extension_id required' }, { status: 400 })
  if (original_id === extension_id && original_kind === extension_kind) return NextResponse.json({ error: 'Cannot link a booking to itself' }, { status: 400 })
  const supabase = createAdminClient()

  // is the original already in a group? reuse it; else create
  const { data: existingMember } = await supabase.from('stay_group_members')
    .select('group_id').eq('booking_id', original_id).eq('booking_kind', original_kind || 'platform').maybeSingle()

  let groupId = existingMember?.group_id
  if (!groupId) {
    const { data: g, error } = await supabase.from('stay_groups').insert({
      property_id: property_id || null, guest_name: guest_name || null,
      primary_booking_id: original_id, primary_booking_kind: original_kind || 'platform',
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    groupId = g.id
    // add the original as a member
    await supabase.from('stay_group_members').insert({
      group_id: groupId, booking_id: original_id, booking_kind: original_kind || 'platform', role: 'original',
    })
  }

  // add the extension
  const { error: memErr } = await supabase.from('stay_group_members').upsert({
    group_id: groupId, booking_id: extension_id, booking_kind: extension_kind || 'direct', role: 'extension',
  }, { onConflict: 'booking_id,booking_kind' })
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })

  // extend the door code to cover the full linked stay (no lockout at original checkout)
  const codeResult = await extendCodeForStayGroup(groupId).catch((e: any) => ({ ok: false, note: e.message }))

  return NextResponse.json({ ok: true, group_id: groupId, code: codeResult })
}

// PATCH update a member's tax treatment: { member_id, mat_treatment?, hst_treatment? }
export async function PATCH(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { member_id, mat_treatment, hst_treatment } = await request.json()
  if (!member_id) return NextResponse.json({ error: 'member_id required' }, { status: 400 })
  const supabase = createAdminClient()
  const updates: any = {}
  if (mat_treatment) updates.mat_treatment = mat_treatment
  if (hst_treatment) updates.hst_treatment = hst_treatment
  const { error } = await supabase.from('stay_group_members').update(updates).eq('id', member_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?group_id= (unlink whole group) or ?member_id= (remove one extension)
export async function DELETE(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const sp = request.nextUrl.searchParams
  const supabase = createAdminClient()
  if (sp.get('member_id')) {
    await supabase.from('stay_group_members').delete().eq('id', sp.get('member_id'))
  } else if (sp.get('group_id')) {
    await supabase.from('stay_groups').delete().eq('id', sp.get('group_id'))
  } else return NextResponse.json({ error: 'group_id or member_id required' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
