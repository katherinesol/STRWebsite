import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendAccessCode } from '@/lib/email'
import { isAuthed } from '@/lib/auth'


export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  const { data: booking } = await supabase.from('bookings').select('*, guest_info:guests(name, email)').eq('id', id).single()
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const guest = Array.isArray(booking.guest_info) ? booking.guest_info[0] : booking.guest_info
  if (!guest?.email) return NextResponse.json({ error: 'No guest email' }, { status: 400 })

  const { data: code } = await supabase.from('access_codes').select('code').eq('booking_id', id).is('revoked_at', null).limit(1).maybeSingle()
  if (!code) return NextResponse.json({ error: 'No access code found' }, { status: 400 })

  await sendAccessCode(booking, guest, code.code)
  await supabase.from('access_codes').update({ code_sent_at: new Date().toISOString() }).eq('booking_id', id)
  return NextResponse.json({ ok: true })
}
