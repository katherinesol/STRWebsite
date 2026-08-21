import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed, hasRole, hasPermission } from '@/lib/auth'

// Creating an invoice touches four tables. PostgREST runs one statement per
// request, so a plain sequence can leave an invoice behind with no line items
// if a later insert fails.
//
// Preferred path: create_invoice_full(), a plpgsql function that runs the whole
// create inside one transaction — any exception rolls all of it back.
// Fallback: if that function has not been installed yet, insert in sequence and
// compensate by deleting everything already written on failure. That covers a
// failed insert but not a process death mid-create, which is exactly why the
// function is preferred.
//
// Idempotent either way: the client supplies every row id, so a repeat submit
// collides on the primary key (23505) instead of creating a second invoice.

const r2 = (v: number) => Math.round(v * 100) / 100
const n = (v: unknown) => (v == null ? 0 : Number(v) || 0)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Line = { id: string; description: string; amount: number; reason?: string }

export async function POST(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await hasRole('co-owner')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await hasPermission('money', 'edit')) {
    return NextResponse.json({ error: 'Not allowed to create invoices' }, { status: 403 })
  }

  const b = await request.json().catch(() => null)
  const invoice_id = String(b?.invoice_id || '')
  const title = String(b?.title || '').trim().slice(0, 200)
  const items: Line[] = Array.isArray(b?.items) ? b.items : []
  const adjustments: Line[] = Array.isArray(b?.adjustments) ? b.adjustments : []
  const payment = b?.payment ?? null
  const createExpense = b?.create_expense === true
  const expense_id = b?.expense_id ? String(b.expense_id) : null
  const hst = n(b?.hst_amount)

  if (!UUID.test(invoice_id)) return NextResponse.json({ error: 'invoice_id required (client-generated)' }, { status: 400 })
  if (!title) return NextResponse.json({ error: 'A job title is required' }, { status: 400 })
  if (items.length === 0) return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })
  for (const l of [...items, ...adjustments]) {
    if (!UUID.test(String(l.id))) return NextResponse.json({ error: 'every line needs a client-generated id' }, { status: 400 })
    if (!Number.isFinite(Number(l.amount)) || Number(l.amount) <= 0) {
      return NextResponse.json({ error: 'every line needs a positive amount' }, { status: 400 })
    }
  }
  if (payment) {
    if (!UUID.test(String(payment.id))) return NextResponse.json({ error: 'payment needs a client-generated id' }, { status: 400 })
    if (!Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0) {
      return NextResponse.json({ error: 'payment needs a positive amount' }, { status: 400 })
    }
    if (createExpense && !UUID.test(String(expense_id))) {
      return NextResponse.json({ error: 'expense_id required when creating an expense' }, { status: 400 })
    }
  }

  const lineTotal = r2(items.reduce((s, l) => s + n(l.amount), 0))
  const heldBack = r2(adjustments.reduce((s, l) => s + n(l.amount), 0))
  const total = r2(lineTotal - heldBack + hst)
  const paid = payment && payment.status !== 'planned' ? r2(n(payment.amount)) : 0

  const supabase = createAdminClient()
  const payload = {
    invoice_id, title,
    contractor_name: b?.contractor_name || null,
    contractor_contact: b?.contractor_contact || null,
    company: b?.company || null,
    property_id: b?.property_id || null,
    category: b?.category || null,
    notes: b?.notes || null,
    hst_amount: hst,
    due_date: b?.due_date || null,
    items, adjustments, payment,
  }

  let already = false
  let mode: 'transaction' | 'compensated' = 'transaction'

  const { data: rpc, error: rpcErr } = await supabase.rpc('create_invoice_full', { payload })

  if (rpcErr && (rpcErr.code === 'PGRST202' || /function .* does not exist/i.test(rpcErr.message))) {
    // ── fallback: sequence + compensating delete ─────────────────────────────
    mode = 'compensated'
    const undo = async () => {
      await supabase.from('invoice_payments').delete().eq('invoice_id', invoice_id)
      await supabase.from('invoice_adjustments').delete().eq('invoice_id', invoice_id)
      await supabase.from('invoice_items').delete().eq('invoice_id', invoice_id)
      await supabase.from('invoices').delete().eq('id', invoice_id)
    }

    const { error: invErr } = await supabase.from('invoices').insert({
      id: invoice_id, title,
      contractor_name: payload.contractor_name, contractor_contact: payload.contractor_contact,
      company: payload.company, property_id: payload.property_id, category: payload.category,
      notes: payload.notes, hst_amount: hst, status: 'open',
      share_token: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
      due_date: payload.due_date,
    })
    if (invErr) {
      if (invErr.code === '23505') already = true
      else return NextResponse.json({ error: invErr.message }, { status: 500 })
    }

    if (!already) {
      const { error: itemErr } = await supabase.from('invoice_items')
        .insert(items.map(l => ({ id: l.id, invoice_id, description: l.description, amount: n(l.amount) })))
      if (itemErr) { await undo(); return NextResponse.json({ error: `Nothing was created — line items failed: ${itemErr.message}`, rolledBack: true }, { status: 500 }) }

      if (adjustments.length) {
        const { error: adjErr } = await supabase.from('invoice_adjustments')
          .insert(adjustments.map(l => ({ id: l.id, invoice_id, description: l.description, amount: n(l.amount), reason: l.reason || 'other' })))
        if (adjErr) { await undo(); return NextResponse.json({ error: `Nothing was created — adjustments failed: ${adjErr.message}`, rolledBack: true }, { status: 500 }) }
      }

      if (payment) {
        const { error: payErr } = await supabase.from('invoice_payments').insert({
          id: payment.id, invoice_id, amount: n(payment.amount),
          paid_at: payment.paid_at || null, method: payment.method || null,
          status: payment.status || 'paid', due_date: payment.due_date || null,
        })
        if (payErr) { await undo(); return NextResponse.json({ error: `Nothing was created — payment failed: ${payErr.message}`, rolledBack: true }, { status: 500 }) }
      }
    }
  } else if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  } else {
    already = !!(rpc as { already?: boolean })?.already
  }

  // the expense, only when explicitly asked for, and never inside the invoice transaction
  let expense = null
  if (payment && createExpense && !already) {
    const { data: created, error: expErr } = await supabase.from('expenses').insert({
      id: expense_id,
      property_id: payload.property_id,
      date: payment.paid_at || new Date().toISOString().split('T')[0],
      vendor: payload.contractor_name || title,
      description: `Payment — ${title}`,
      amount: n(payment.amount),
      category: payload.category || 'Repairs & maintenance',
      notes: 'From invoice tracker',
      confirmed: true,
    }).select().single()
    if (!expErr) {
      expense = created
      await supabase.from('invoice_payments').update({ expense_created: true }).eq('id', payment.id)
    } else if (expErr.code === '23505') {
      const { data: existing } = await supabase.from('expenses').select('*').eq('id', expense_id).maybeSingle()
      expense = existing
    } else {
      return NextResponse.json({ ok: true, invoice_id, already, mode, warning: `Invoice created, but the expense failed: ${expErr.message}` })
    }
  }

  return NextResponse.json({
    ok: true, invoice_id, already, mode, expense,
    totals: { lineItems: lineTotal, heldBack, hst, total, paid, outstanding: r2(total - paid) },
  })
}
