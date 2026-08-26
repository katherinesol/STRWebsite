import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed, hasRole, hasPermission } from '@/lib/auth'

// Recording a payment against an invoice. Two distinct actions, because
// collapsing them would either strand a scheduled row or double-count it:
//
//   settle — a 'planned' row becomes 'paid' (the scheduled billpay case)
//   log    — a payment that already happened is inserted directly as 'paid'
//
// The expense cascade is NEVER implicit: create_expense must be sent, and the
// caller shows it on the confirm step. Both writes are idempotent because the
// client supplies the row ids, so a double-click collides on the primary key
// instead of writing twice.

const r2 = (v: number) => Math.round(v * 100) / 100
const n = (v: unknown) => (v == null ? 0 : Number(v) || 0)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Arithmetic for one invoice. Planned payments are never counted as paid. */
async function snapshot(supabase: ReturnType<typeof createAdminClient>, invoiceId: string) {
  const [{ data: inv }, { data: items }, { data: adj }, { data: pays }] = await Promise.all([
    supabase.from('invoices').select('hst_amount, title, contractor_name, property_id, category').eq('id', invoiceId).maybeSingle(),
    supabase.from('invoice_items').select('amount').eq('invoice_id', invoiceId),
    supabase.from('invoice_adjustments').select('amount').eq('invoice_id', invoiceId),
    supabase.from('invoice_payments').select('amount, status').eq('invoice_id', invoiceId),
  ])
  const lineItems = r2((items || []).reduce((s, x) => s + n(x.amount), 0))
  const heldBack = r2((adj || []).reduce((s, x) => s + n(x.amount), 0))
  const hst = n(inv?.hst_amount)
  const total = r2(lineItems - heldBack + hst)
  const paid = r2((pays || []).filter(p => p.status === 'paid').reduce((s, p) => s + n(p.amount), 0))
  const planned = r2((pays || []).filter(p => p.status === 'planned').reduce((s, p) => s + n(p.amount), 0))
  return { lineItems, heldBack, hst, total, paid, planned, outstanding: r2(total - paid), invoice: inv }
}

export async function POST(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await hasRole('co-owner')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await hasPermission('money', 'edit')) {
    return NextResponse.json({ error: 'Not allowed to record payments' }, { status: 403 })
  }

  const b = await request.json().catch(() => null)
  const action = String(b?.action || '')
  const invoice_id = String(b?.invoice_id || '')
  const payment_id = String(b?.payment_id || '')
  const createExpense = b?.create_expense === true
  const expense_id = b?.expense_id ? String(b.expense_id) : null
  const paid_at = String(b?.paid_at || '').slice(0, 10)

  if (!['settle', 'log'].includes(action)) return NextResponse.json({ error: 'action must be settle or log' }, { status: 400 })
  if (!UUID.test(invoice_id)) return NextResponse.json({ error: 'invoice_id required' }, { status: 400 })
  if (!UUID.test(payment_id)) return NextResponse.json({ error: 'payment_id required (client-generated for idempotency)' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paid_at)) return NextResponse.json({ error: 'A valid paid date is required' }, { status: 400 })
  if (createExpense && !UUID.test(String(expense_id))) {
    return NextResponse.json({ error: 'expense_id required when creating an expense' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const before = await snapshot(supabase, invoice_id)
  if (!before.invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  let already = false
  let amount = 0

  if (action === 'settle') {
    const { data: row } = await supabase
      .from('invoice_payments').select('*').eq('id', payment_id).maybeSingle()
    if (!row) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    if (row.invoice_id !== invoice_id) return NextResponse.json({ error: 'Payment belongs to another invoice' }, { status: 400 })
    amount = n(row.amount)

    // compare-and-swap: only a still-planned row flips
    const { data: flipped } = await supabase
      .from('invoice_payments')
      .update({ status: 'paid', paid_at })
      .eq('id', payment_id).eq('status', 'planned')
      .select('id')
    already = !flipped || flipped.length === 0
  } else {
    amount = Number(b?.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'A positive amount is required' }, { status: 400 })
    }
    const { error } = await supabase.from('invoice_payments').insert({
      id: payment_id, invoice_id, amount, paid_at, status: 'paid',
      method: b?.method || null,
      method_detail: b?.method_detail || null,
      method_last4: b?.method_last4 || null,
      // the confirmation number you can quote back at a bank statement
      reference: b?.reference || null,
    })
    // 23505 = the same client-generated id already landed; this is a repeat submit
    if (error && error.code !== '23505') return NextResponse.json({ error: error.message }, { status: 500 })
    already = !!error
  }

  // the expense, only if explicitly asked for
  let expense = null
  if (createExpense) {
    const { data: pay } = await supabase
      .from('invoice_payments').select('expense_created').eq('id', payment_id).maybeSingle()
    if (!pay?.expense_created) {
      const inv = before.invoice
      const { data: created, error: expErr } = await supabase.from('expenses').insert({
        id: expense_id,
        property_id: inv.property_id || null,
        date: paid_at,
        vendor: inv.contractor_name || inv.title,
        description: `Payment — ${inv.title}`,
        amount,
        category: inv.category || 'Repairs & maintenance',
        notes: 'From invoice tracker',
        confirmed: true,
      }).select().single()
      if (!expErr) {
        expense = created
        await supabase.from('invoice_payments').update({ expense_created: true }).eq('id', payment_id)
      } else if (expErr.code === '23505') {
        const { data: existing } = await supabase.from('expenses').select('*').eq('id', expense_id).maybeSingle()
        expense = existing
      } else {
        return NextResponse.json({ error: `Payment recorded, but the expense failed: ${expErr.message}`, before, after: await snapshot(supabase, invoice_id) }, { status: 500 })
      }
    }
  }

  const after = await snapshot(supabase, invoice_id)
  return NextResponse.json({ ok: true, already, action, amount, before, after, expense })
}
