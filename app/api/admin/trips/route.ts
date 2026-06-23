import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed } from '@/lib/auth'


export async function POST(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('trips').insert(body).select().single()
  if (error) { console.error('Trips POST error:', JSON.stringify(error)); return NextResponse.json({ error: error.message }, { status: 500 }) }
  return NextResponse.json({ trip: data })
}
