import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { addDays, format } from 'date-fns'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const in48h = format(addDays(new Date(), 2), 'yyyy-MM-dd')

  const { data: bookings } = await supabase
    .from('bookings')
    .select('*, guests(name, email), access_codes(*)')
    .eq('check_in', in48h)
    .eq('status', 'confirmed')

  if (!bookings?.length) return NextResponse.json({ sent: 0 })

  let sent = 0
  for (const booking of bookings) {
    const codes = (booking.access_codes as any[]) || []
    const unsentCodes = codes.filter((c: any) => !c.code_sent_at && !c.revoked_at)
    if (!unsentCodes.length) continue
    const guest = booking.guests as any
    if (!guest?.email) continue
    for (const code of unsentCodes) {
      await supabase.from('access_codes').update({ code_sent_at: new Date().toISOString() }).eq('id', code.id)
    }
    console.log(`Access code for ${guest.name}: ${unsentCodes.map((c: any) => `${c.notes}: ${c.code}`).join(', ')}`)
    sent++
  }

  return NextResponse.json({ sent, checkinDate: in48h })
}
