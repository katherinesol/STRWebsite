import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// Serves a private storage object to an authenticated admin via a short-lived signed URL.
export async function GET(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const path = request.nextUrl.searchParams.get('path')
  if (!path || path.includes('..')) return NextResponse.json({ error: 'Bad path' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from('property-management').createSignedUrl(path, 300)
  if (error || !data?.signedUrl) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}
