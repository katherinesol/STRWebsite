import { NextRequest, NextResponse } from 'next/server'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// list all knowledge entries (owner + co-owner)
export async function GET() {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('knowledge_base').select('*').order('property_id').order('topic')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: data || [] })
}

// create an entry
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()
  const { property_id, topic, title, content } = await request.json()
  if (!title || !content) return NextResponse.json({ error: 'Title and content required' }, { status: 400 })
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('knowledge_base').insert({
    property_id: property_id || 'general',
    topic: topic || 'general',
    title, content,
    created_by: auth.ok ? auth.userId : null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, entry: data })
}
