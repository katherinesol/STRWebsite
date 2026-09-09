import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { PROPERTIES } from '@/lib/properties'

/*  THE HOUSE GUIDE, AT A DELIBERATELY PUBLIC ADDRESS.
 *
 *  The guest hub used to fetch this from /api/admin/guest-guide. That worked only
 *  because the admin route's GET had never been gated, while its POST, PUT and
 *  DELETE all check hasRole('owner','co-owner') — so a public page depended on an
 *  admin endpoint being accidentally open, and the obvious security tidy-up
 *  (harden the GET to match its siblings) would have silently broken the House
 *  Guide for every guest. Nobody would have connected the two changes.
 *
 *  PUBLIC IS THE POINT HERE, not an oversight. A guest reaches the hub from a
 *  link in their booking with no account and no session; requiring auth would
 *  defeat the surface. Saying so in its own namespace is the difference between
 *  a decision and an accident.
 *
 *  IT EXPOSES NOTHING A GUEST SHOULD NOT SEE. The guest-guides bucket is already
 *  public, so the URL returned is one anyone could construct; the response is
 *  exactly what the hub renders — whether a guide exists, and where it is. No
 *  listing, no other property's files, no storage internals.
 *
 *  The property id is checked against PROPERTIES rather than passed through, so
 *  this cannot be used to probe the bucket for arbitrary paths. */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get('property_id') || ''
  if (!propertyId) return NextResponse.json({ error: 'property_id required' }, { status: 400 })
  if (!PROPERTIES[propertyId]) return NextResponse.json({ error: 'Unknown property' }, { status: 404 })

  const supabase = createAdminClient()
  const path = `${propertyId}-guide.pdf`
  const { data: files } = await supabase.storage.from('guest-guides').list('', { search: path })
  const exists = (files || []).some(f => f.name === path)
  const { data: pub } = supabase.storage.from('guest-guides').getPublicUrl(path)

  return NextResponse.json({ exists, url: exists ? pub.publicUrl : null })
}
