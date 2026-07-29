import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { Seam } from 'seam'
import { createAdminClient } from '@/lib/supabase/server'

function seamClient() {
  const k = process.env.SEAM_API_KEY
  if (!k) throw new Error('SEAM_API_KEY not set')
  return new Seam({ apiKey: k })
}

export async function GET() {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()
  const { data } = await supabase.from('staff_access').select('*').eq('active', true).order('created_at', { ascending: false })
  return NextResponse.json({ grants: data || [] })
}

export async function POST(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { person_name, role, code, access_type, starts_at, ends_at, lock_ids } = await request.json()
  if (!person_name || !code || !Array.isArray(lock_ids) || !lock_ids.length) return NextResponse.json({ error: 'Name, code, and at least one door required' }, { status: 400 })
  if (!/^\d{4}$/.test(code)) return NextResponse.json({ error: 'Code must be 4 digits' }, { status: 400 })
  if (access_type === 'fixed' && (!starts_at || !ends_at)) return NextResponse.json({ error: 'Fixed access needs a start and end' }, { status: 400 })

  const seam = seamClient()
  const supabase = createAdminClient()
  const { data: locks } = await supabase.from('property_locks').select('seam_device_id, lock_name').in('seam_device_id', lock_ids)

  const codeIds: any[] = []
  const results: any[] = []
  for (const lock of locks || []) {
    try {
      const payload: any = { device_id: lock.seam_device_id, name: `${person_name}${role ? ' · ' + role : ''}`, code }
      if (access_type === 'fixed') { payload.starts_at = starts_at; payload.ends_at = ends_at }
      const ac = await seam.accessCodes.create(payload)  // ongoing if no starts/ends
      codeIds.push({ device_id: lock.seam_device_id, access_code_id: ac.access_code_id })
      results.push({ lock: lock.lock_name, ok: true, status: ac.status })
    } catch (e: any) {
      results.push({ lock: lock.lock_name, ok: false, error: e?.message })
    }
  }

  const { data: grant } = await supabase.from('staff_access').insert({
    person_name, role: role || null, code, access_type: access_type || 'ongoing',
    starts_at: access_type === 'fixed' ? starts_at : null,
    ends_at: access_type === 'fixed' ? ends_at : null,
    lock_ids, seam_code_ids: codeIds,
  }).select('id').single()

  return NextResponse.json({ ok: true, grant_id: grant?.id, results })
}

// revoke — delete the codes from the locks and deactivate the grant
export async function DELETE(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id } = await request.json()
  const supabase = createAdminClient()
  const { data: grant } = await supabase.from('staff_access').select('seam_code_ids').eq('id', id).single()
  if (grant?.seam_code_ids) {
    const seam = seamClient()
    for (const c of grant.seam_code_ids as any[]) {
      try { await seam.accessCodes.delete({ access_code_id: c.access_code_id }) } catch {}
    }
  }
  await supabase.from('staff_access').update({ active: false }).eq('id', id)
  return NextResponse.json({ ok: true })
}
