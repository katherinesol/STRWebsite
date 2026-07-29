import { NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()
  const { data } = await supabase.from('property_locks').select('seam_device_id, lock_name, property_id').eq('active', true)
  // dedupe by device (Royal Side appears twice)
  const seen = new Set(); const locks: any[] = []
  for (const l of data || []) { if (!seen.has(l.seam_device_id)) { seen.add(l.seam_device_id); locks.push(l) } }
  return NextResponse.json({ locks })
}
