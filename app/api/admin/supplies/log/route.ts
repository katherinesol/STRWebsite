import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === process.env.ADMIN_SECRET
}

export async function POST(request: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { supply_id, property_id, action, quantity_change, note, logged_by } = body

  const supabase = createAdminClient()

  // log the action
  const { error: logError } = await supabase.from('supply_logs').insert({
    supply_id, property_id, action, quantity_change: quantity_change || 0, note, logged_by,
  })

  if (logError) {
    console.error('Supply log error:', logError.message)
    return NextResponse.json({ error: logError.message }, { status: 500 })
  }

  // update quantity if restocking
  if (action === 'restocked' && quantity_change > 0) {
    const { data: supply } = await supabase.from('supplies').select('quantity_on_hand').eq('id', supply_id).single()
    if (supply) {
      await supabase.from('supplies').update({
        quantity_on_hand: (supply.quantity_on_hand || 0) + quantity_change,
      }).eq('id', supply_id)
    }
  }

  return NextResponse.json({ ok: true })
}
