import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed } from '@/lib/auth'


// approve: create real expense from pending; reject: mark rejected
export async function POST(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { id, action, fields } = body
  const supabase = createAdminClient()

  if (action === 'reject') {
    await supabase.from('pending_receipts').update({ status: 'rejected' }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  if (action === 'approve') {
    const f = fields || {}
    const amount = parseFloat(f.amount) || 0
    const date = f.date || new Date().toISOString().split('T')[0]
    const vendor = f.vendor || null

    // duplicate check (skip if force flag) — same 3-tier as manual entry
    if (!f.force) {
      if (vendor) {
        const { data: exact } = await supabase.from('expenses')
          .select('id').eq('vendor', vendor).eq('amount', amount).eq('date', date).limit(1)
        if (exact?.length) {
          return NextResponse.json({ duplicate: true, level: 'exact', message: `Identical expense exists: ${vendor} $${amount} on ${date}` }, { status: 409 })
        }
      }
      const { data: sameDay } = await supabase.from('expenses')
        .select('id, vendor').eq('amount', amount).eq('date', date).limit(1)
      if (sameDay?.length) {
        return NextResponse.json({ duplicate: true, level: 'likely', message: `Same amount ($${amount}) already logged on ${date} (${sameDay[0].vendor || 'no vendor'})` }, { status: 409 })
      }
      if (vendor) {
        const d = new Date(date)
        const before = new Date(d); before.setDate(d.getDate() - 3)
        const after = new Date(d); after.setDate(d.getDate() + 3)
        const { data: nearby } = await supabase.from('expenses')
          .select('id, date').eq('vendor', vendor).eq('amount', amount)
          .gte('date', before.toISOString().split('T')[0])
          .lte('date', after.toISOString().split('T')[0]).limit(1)
        if (nearby?.length) {
          return NextResponse.json({ duplicate: true, level: 'possible', message: `${vendor} $${amount} logged ${nearby[0].date} — within 3 days` }, { status: 409 })
        }
      }
    }

    const { error } = await supabase.from('expenses').insert({
      vendor,
      amount,
      hst_paid: f.hst_paid ? parseFloat(f.hst_paid) : null,
      date,
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
