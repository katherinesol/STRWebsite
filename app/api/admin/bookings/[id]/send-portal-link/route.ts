import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendPortalSetup } from '@/lib/email'
import { isAuthed } from '@/lib/auth'


export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()

  const { data: booking } = await supabase.from('bookings').select('*, guest_info:guests(name, email)').eq('id', id).single()
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const guest = Array.isArray(booking.guest_info) ? booking.guest_info[0] : booking.guest_info
  if (!guest?.email) return NextResponse.json({ error: 'No guest email' }, { status: 400 })

  // generate magic link
  const { data: linkData } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: guest.email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/portal/${id}` },
  })

  const magicLink = linkData?.properties?.action_link || `${process.env.NEXT_PUBLIC_SITE_URL}/portal/login`
  await sendPortalSetup(guest, magicLink)
  return NextResponse.json({ ok: true })
}
