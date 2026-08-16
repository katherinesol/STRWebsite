import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// POST (multipart): property_id + file → uploads {property_id}-guide.pdf to guest-guides bucket
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const form = await request.formData()
  const propertyId = String(form.get('property_id') || '')
  const file = form.get('file') as File | null
  if (!propertyId || !file) return NextResponse.json({ error: 'property_id and file required' }, { status: 400 })
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'Must be a PDF' }, { status: 400 })

  const supabase = createAdminClient()
  const path = `${propertyId}-guide.pdf`
  const bytes = Buffer.from(await file.arrayBuffer())
  const { error } = await supabase.storage.from('guest-guides').upload(path, bytes, { contentType: 'application/pdf', upsert: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: pub } = supabase.storage.from('guest-guides').getPublicUrl(path)
  return NextResponse.json({ ok: true, url: pub.publicUrl })
}

// PUT → returns a signed upload URL for the browser to upload a large PDF directly
export async function PUT(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { property_id } = await request.json()
  if (!property_id) return NextResponse.json({ error: 'property_id required' }, { status: 400 })
  const supabase = createAdminClient()
  const path = `${property_id}-guide.pdf`
  const { data, error } = await supabase.storage.from('guest-guides').createSignedUploadUrl(path, { upsert: true } as any)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ token: data.token, path: data.path, signedUrl: data.signedUrl })
}

// GET ?property_id= → returns whether a guide exists + its public URL
export async function GET(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get('property_id') || ''
  if (!propertyId) return NextResponse.json({ error: 'property_id required' }, { status: 400 })
  const supabase = createAdminClient()
  const path = `${propertyId}-guide.pdf`
  const { data: files } = await supabase.storage.from('guest-guides').list('', { search: path })
  const exists = (files || []).some(f => f.name === path)
  const { data: pub } = supabase.storage.from('guest-guides').getPublicUrl(path)
  return NextResponse.json({ exists, url: exists ? pub.publicUrl : null })
}
