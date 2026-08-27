import { NextRequest, NextResponse } from 'next/server'
import { hasRole, hasPermission } from '@/lib/auth'
import { Seam } from 'seam'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  // reads code state and changes nothing, so view is the right level — and this
  // is the first 'view' check in the codebase
  if (!await hasPermission('locks', 'view')) return NextResponse.json({ error: 'Not allowed to view lock status' }, { status: 403 })
  const propertyId = request.nextUrl.searchParams.get('property_id')
  const code = request.nextUrl.searchParams.get('code')
  if (!propertyId) return NextResponse.json({ error: 'property_id required' }, { status: 400 })

  const apiKey = process.env.SEAM_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'SEAM_API_KEY not set' }, { status: 500 })
  const seam = new Seam({ apiKey })
  const supabase = createAdminClient()

  const { data: locks } = await supabase.from('property_locks')
    .select('seam_device_id, lock_name, airbnb_managed')
    .eq('property_id', propertyId).eq('active', true)

  const doors: any[] = []
  for (const lock of locks || []) {
    try {
      const codes = await seam.accessCodes.list({ device_id: lock.seam_device_id })
      const match = code ? codes.find((c: any) => c.code === code) : null
      doors.push({
        lock: lock.lock_name,
        airbnb_managed: lock.airbnb_managed,
        code: match?.code || null,
        status: match?.status || 'not set',
        errored: (match?.errors || []).length > 0,
      })
    } catch (e: any) {
      doors.push({ lock: lock.lock_name, error: e?.message })
    }
  }
  return NextResponse.json({ doors, checked_at: new Date().toISOString() })
}
