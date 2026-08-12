import { NextRequest, NextResponse } from 'next/server'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// GET ?session=ID  → messages for a session (or most recent session if none)
// GET ?list=1      → list of sessions
export async function GET(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()
  const sp = request.nextUrl.searchParams

  if (sp.get('list')) {
    const { data } = await supabase.from('haussy_sessions').select('*').order('last_message_at', { ascending: false }).limit(50)
    return NextResponse.json({ sessions: data || [] })
  }

  let sessionId = sp.get('session')
  if (!sessionId) {
    const { data } = await supabase.from('haussy_sessions').select('id').order('last_message_at', { ascending: false }).limit(1).maybeSingle()
    sessionId = data?.id || null
  }
  if (!sessionId) return NextResponse.json({ session_id: null, messages: [] })

  const { data: msgs } = await supabase.from('haussy_messages').select('*').eq('session_id', sessionId).order('created_at')
  // sign image urls
  for (const m of msgs || []) {
    if (m.image_paths?.length) {
      const signed: string[] = []
      for (const p of m.image_paths) {
        const { data: u } = await supabase.storage.from('haussy-uploads').createSignedUrl(p, 3600)
        if (u?.signedUrl) signed.push(u.signedUrl)
      }
      ;(m as any).image_urls = signed
    }
  }
  return NextResponse.json({ session_id: sessionId, messages: msgs || [] })
}

// POST save a message: { session_id?, role, content, images?: [{data, mediaType}] }
export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()
  const { session_id, role, content, images } = await request.json()
  const supabase = createAdminClient()

  // ensure a session
  let sid = session_id
  if (!sid) {
    const { data: sess } = await supabase.from('haussy_sessions').insert({
      title: (content || 'New chat').slice(0, 50), created_by: auth.ok ? auth.userId : null,
    }).select('id').single()
    sid = sess?.id
  }

  // upload images
  const paths: string[] = []
  for (const img of images || []) {
    const buf = Buffer.from(img.data, 'base64')
    const ext = (img.mediaType || 'image/jpeg').split('/')[1] || 'jpg'
    const path = `${sid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error } = await supabase.storage.from('haussy-uploads').upload(path, buf, { contentType: img.mediaType })
    if (!error) paths.push(path)
  }

  await supabase.from('haussy_messages').insert({
    session_id: sid, role, content: content || '', image_paths: paths.length ? paths : null,
  })
  await supabase.from('haussy_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', sid)

  return NextResponse.json({ ok: true, session_id: sid })
}
