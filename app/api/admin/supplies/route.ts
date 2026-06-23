import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { isAuthed } from '@/lib/auth'


export async function POST(request: NextRequest) {
  const authed = await isAuthed()
  console.log('Supplies auth check:', authed, 'secret present:', !!process.env.ADMIN_SECRET)
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('supplies').insert(body).select().single()
  if (error) { console.error('Supplies POST error:', JSON.stringify(error), 'body:', JSON.stringify(body)); return NextResponse.json({ error: error.message }, { status: 500 }) }
  revalidatePath('/admin/property-management/supplies')
  return NextResponse.json({ supply: data })
}
