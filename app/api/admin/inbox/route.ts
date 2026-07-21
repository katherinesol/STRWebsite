import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// list conversations, most recent first
export async function GET() {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('last_message_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ conversations: data || [] })
}

// create a conversation (e.g. host starts one, or a connector ingests one)
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { property_id, guest_id, guest_name, channel, booking_id } = await request.json()
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('conversations').insert({
    property_id: property_id || null, guest_id: guest_id || null,
    guest_name: guest_name || 'Guest', channel: channel || 'direct', booking_id: booking_id || null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, conversation: data })
}
