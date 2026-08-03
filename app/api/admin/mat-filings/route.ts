import { NextRequest, NextResponse } from 'next/server'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const property = request.nextUrl.searchParams.get('property')
  const supabase = createAdminClient()
  let q = supabase.from('mat_filings').select('*').order('year', { ascending: false }).order('quarter', { ascending: false })
  if (property) q = q.eq('property_id', property)
  const { data } = await q
  // attach a signed URL for any stored confirmation document
  const filings = []
  for (const f of data || []) {
    let file_url = null
    if (f.confirmation_file_path) {
      const { data: signed } = await supabase.storage.from('mat-filings').createSignedUrl(f.confirmation_file_path, 3600)
      file_url = signed?.signedUrl || null
    }
    filings.push({ ...f, file_url })
  }
  return NextResponse.json({ filings })
}

export async function POST(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()
  const form = await request.formData()
  const property_id = form.get('property_id') as string
  const year = Number(form.get('year'))
  const quarter = form.get('quarter') as string
  if (!property_id || !year || !quarter) return NextResponse.json({ error: 'property, year, quarter required' }, { status: 400 })

  const supabase = createAdminClient()

  // optional confirmation document (PDF/JPEG)
  let filePath: string | null = null
  const file = form.get('file') as File | null
  if (file && file.size > 0) {
    const ext = file.name.split('.').pop() || 'pdf'
    filePath = `${property_id}/${year}-${quarter}-${Date.now()}.${ext}`
    const bytes = await file.arrayBuffer()
    const { error: upErr } = await supabase.storage.from('mat-filings').upload(filePath, bytes, { contentType: file.type, upsert: true })
    if (upErr) return NextResponse.json({ error: 'Upload failed: ' + upErr.message }, { status: 500 })
  }

  const row: any = {
    property_id, jurisdiction: 'toronto', year, quarter,
    nights_booked: form.get('nights_booked') ? Number(form.get('nights_booked')) : null,
    room_revenue: form.get('room_revenue') ? Number(form.get('room_revenue')) : null,
    mat_due: form.get('mat_due') ? Number(form.get('mat_due')) : null,
    mat_remitted: form.get('mat_remitted') ? Number(form.get('mat_remitted')) : null,
    confirmation_number: (form.get('confirmation_number') as string) || null,
    filed_at: (form.get('filed_at') as string) || new Date().toISOString(),
    filed_by: (auth as any)?.name || (auth as any)?.userId || null,
    notes: (form.get('notes') as string) || null,
  }
  if (filePath) row.confirmation_file_path = filePath

  const { data, error } = await supabase.from('mat_filings')
    .upsert(row, { onConflict: 'property_id,jurisdiction,year,quarter' })
    .select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id })
}
