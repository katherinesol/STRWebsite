import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// GET → { since, byProperty: { [propertyId]: [events] } }  activity since the viewer's last_seen_calendar
export async function GET() {
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()

  const { data: profile } = await supabase.from('profiles').select('last_seen_calendar').eq('id', auth.userId).maybeSingle()
  const since = profile?.last_seen_calendar || new Date(Date.now() - 7 * 86400000).toISOString()  // first visit: last 7 days

  const { data: events } = await supabase.from('calendar_activity')
    .select('*').gt('created_at', since).order('created_at', { ascending: false }).limit(100)

  const byProperty: Record<string, any[]> = {}
  for (const e of events || []) {
    ;(byProperty[e.property_id] ||= []).push({
      id: e.id, type: e.event_type, description: e.description,
      guest: e.guest_name, actor: e.actor_name, at: e.created_at,
    })
  }
  return NextResponse.json({ since, byProperty })
}

// POST { property_id? } → mark seen (updates last_seen_calendar to now)
export async function POST(request: NextRequest) {
  const auth = await getAuth()
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()
  // simple model: "mark seen" resets the whole feed's baseline to now
  await supabase.from('profiles').update({ last_seen_calendar: new Date().toISOString() }).eq('id', auth.userId)
  return NextResponse.json({ ok: true })
}
