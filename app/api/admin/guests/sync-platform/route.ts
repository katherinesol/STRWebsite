import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === process.env.ADMIN_SECRET
}

export async function POST(request: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, email, phone, platform } = await request.json()
  if (!name) return NextResponse.json({ ok: true })

  const supabase = createAdminClient()

  if (email) {
    // upsert guest by email
    const { data: existing } = await supabase
      .from('guests')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      await supabase.from('guests').update({
        name,
        ...(phone && { phone }),
        returning_guest: true,
      }).eq('id', existing.id)
    } else {
      await supabase.from('guests').insert({
        name,
        email,
        ...(phone && { phone }),
        notes: `First seen via ${platform}`,
      })
    }
  } else {
    // no email — just create with name if not duplicate
    const { data: existing } = await supabase
      .from('guests')
      .select('id')
      .ilike('name', name)
      .maybeSingle()

    if (!existing) {
      await supabase.from('guests').insert({
        name,
        ...(phone && { phone }),
        email: `${name.toLowerCase().replace(/\s+/g, '.')}@platform.noemail`,
        notes: `Added from ${platform} — no email on file`,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
