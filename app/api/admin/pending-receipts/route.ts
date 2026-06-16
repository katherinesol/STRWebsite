import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === process.env.ADMIN_SECRET
}

// approve: create real expense from pending; reject: mark rejected
export async function POST(request: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { id, action, fields } = body
  const supabase = createAdminClient()

  if (action === 'reject') {
    await supabase.from('pending_receipts').update({ status: 'rejected' }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'approve') {
    const f = fields || {}
    const { error } = await supabase.from('expenses').insert({
      vendor: f.vendor || null,
      amount: parseFloat(f.amount) || 0,
      hst_paid: f.hst_paid ? parseFloat(f.hst_paid) : null,
      date: f.date || new Date().toISOString().split('T')[0],
      category: f.category || 'Other',
      description: f.description || f.vendor || 'Receipt',
      property_id: f.property_id || null,
      receipt_path: f.receipt_path || null,
      ai_extracted: true,
      confirmed: true,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase.from('pending_receipts').update({ status: 'approved' }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
