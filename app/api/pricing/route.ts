import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get('property')
  if (!propertyId) return NextResponse.json({ error: 'property required' }, { status: 400 })

  const supabase = createAdminClient()
  const [{ data: config }, { data: overrides }] = await Promise.all([
    supabase.from('property_pricing').select('*').eq('property_id', propertyId).maybeSingle(),
    supabase.from('pricing_overrides').select('*').eq('property_id', propertyId),
  ])

  return NextResponse.json({
    config: config || null,
    overrides: overrides || [],
  })
}
