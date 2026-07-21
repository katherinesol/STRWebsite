import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// get a thread's messages + mark read
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id } = await params
  const supabase = createAdminClient()
  const [{ data: conversation }, { data: messages }] = await Promise.all([
    supabase.from('conversations').select('*').eq('id', id).maybeSingle(),
    supabase.from('messages').select('*').eq('conversation_id', id).order('created_at'),
  ])
  if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // mark read
  await supabase.from('conversations').update({ unread: false }).eq('id', id)
  return NextResponse.json({ conversation, messages: messages || [] })
}
