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
        // Record WHICH expense, not merely that there was one. Setting only the
        // flag left the payment unable to clean up its expense on delete, and
        // made expense_created underivable from expense_id — the discrepancy the
        // payments backfill had to work around. The id is client-generated here,
        // so it is known before the insert; there is no reason it was omitted.
        await supabase.from('invoice_payments')
          .update({ expense_id: created.id, expense_created: true }).eq('id', payment_id)
      } else if (expErr.code === '23505') {
        // the same client-generated expense id already landed — a repeat submit.
        // Link it anyway: the row exists and the payment should still point at it.
        const { data: existing } = await supabase.from('expenses').select('*').eq('id', expense_id).maybeSingle()
        expense = existing
        if (existing) {
          await supabase.from('invoice_payments')
            .update({ expense_id: existing.id, expense_created: true })
            .eq('id', payment_id).is('expense_id', null)
        }
      } else {
        return NextResponse.json({ error: `Payment recorded, but the expense failed: ${expErr.message}`, before, after: await snapshot(supabase, invoice_id) }, { status: 500 })
      }
    }
  }

  const after = await snapshot(supabase, invoice_id)
  return NextResponse.json({ ok: true, already, action, amount, before, after, expense })
}


/*  DELETE ONE PAYMENT, and the expense it filed.
 *
 *  The legacy screen did this by removing the row from an array and posting the
 *  whole invoice back through save, which deletes anything missing from the
 *  payload. That works, and it is also the mechanism that would erase an entire
 *  invoice if the payload were ever incomplete. This deletes exactly one row.
 *
 *  It removes the linked expense too, because the expense was minted BY this
 *  payment and describes money that this payment recorded. Leaving it behind
 *  means a cost in the books with nothing to explain it — which is what happened
 *  before expense_id was recorded, and is why three older payments still cannot
 *  be cleaned up this way: nothing says which expense was theirs.
 *
 *  Two steps on purpose. Without ?confirm=true it reports what WOULD go and
 *  deletes nothing, so the control can name the consequence before anyone agrees
 *  to it. */
export async function DELETE(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('money', 'edit')) {
    return NextResponse.json({ error: 'Not allowed to delete payments' }, { status: 403 })
  }
  const id = request.nextUrl.searchParams.get('id')
  const confirmed = request.nextUrl.searchParams.get('confirm') === 'true'
  if (!id || !UUID.test(id)) return NextResponse.json({ error: 'A payment id is required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: pay } = await supabase.from('invoice_payments')
    .select('id, invoice_id, amount, paid_at, status, method, method_detail, method_last4, reference, expense_created, expense_id')
    .eq('id', id).maybeSingle()
  if (!pay) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

  const { data: expense } = pay.expense_id
    ? await supabase.from('expenses').select('id, date, vendor, description, amount').eq('id', pay.expense_id).maybeSingle()
    : { data: null }

  // an expense was filed but nothing recorded which one — it cannot be removed here
  const orphanWarning = pay.expense_created && !pay.expense_id

  if (!confirmed) {
    return NextResponse.json({
      preview: true,
      payment: { amount: pay.amount, paid_at: pay.paid_at, status: pay.status, method: pay.method, reference: pay.reference },
      expense: expense ? { amount: expense.amount, description: expense.description, date: expense.date } : null,
      orphan_warning: orphanWarning,
    })
  }

  if (expense) {
    const { error: eErr } = await supabase.from('expenses').delete().eq('id', expense.id)
    if (eErr) return NextResponse.json({ error: `Nothing was deleted — the expense could not be removed: ${eErr.message}` }, { status: 500 })
  }
  const { error } = await supabase.from('invoice_payments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true, deleted_payment: id,
    deleted_expense: expense ? expense.id : null,
    orphan_warning: orphanWarning,
  })
}


/*  EDIT ONE PAYMENT, and keep its expense saying the same thing.
 *
 *  Correcting a mistyped amount used to mean deleting the payment and logging it
 *  again, which destroys the filed expense and mints a new one with a new id and
 *  a new date — an identity change for what is a text fix.
 *
 *  THE BUG THIS DOES NOT INHERIT. The legacy screen edits payments through
 *  save's 3a branch, which updates invoice_payments and then calls mintExpense —
 *  and mintExpense returns early when an expense already exists. So editing an
 *  amount there leaves the expense at the OLD figure, silently. Nineteen linked
 *  pairs agree today only because nobody has done it since the links existed.
 *  Here the expense is updated in place: same row, same id, same date and vendor
 *  and category, only the figure moved. The expense IS that payment in the books,
 *  so a correction should not rewrite its identity.
 *
 *  THE DESCRIPTION FOLLOWS THE METHOD. An expense reads "Payment - Flooring
 *  (etransfer BMO ...0377)". Change the payment to a different account and leave
 *  that alone, and the books name an account the payment no longer claims — the
 *  same false-account-in-the-ledger problem the account work exists to prevent.
 *
 *  What it will not do: change status, parentage, or expense_created. Marking a
 *  planned payment paid FILES an expense, which is creation, not correction, and
 *  belongs to the settle path. And a payment whose expense was deliberately
 *  deleted is not given a new one behind your back.
 *
 *  hst_paid is left alone on an amount edit. It is the invoice's total HST
 *  stamped onto each expense, never a per-payment figure — already an
 *  approximation, and recomputing it here would compound one guess with another. */
export async function PATCH(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('money', 'edit')) {
    return NextResponse.json({ error: 'Not allowed to edit payments' }, { status: 403 })
  }
  const id = request.nextUrl.searchParams.get('id')
  const confirmed = request.nextUrl.searchParams.get('confirm') === 'true'
  if (!id || !UUID.test(id)) return NextResponse.json({ error: 'A payment id is required' }, { status: 400 })

  const raw = await request.json().catch(() => ({}))
  const EDITABLE = new Set(['amount', 'method', 'method_detail', 'method_last4', 'paid_at', 'reference'])
  const rejected = Object.keys(raw || {}).filter(k => !EDITABLE.has(k))
  if (rejected.length) {
    return NextResponse.json({
      error: 'Not editable on a payment', rejected,
      detail: 'Status, parentage and the expense link are not changed here. Marking a planned payment paid files an expense and belongs to Mark paid.',
    }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: before } = await supabase.from('invoice_payments')
    .select('id, invoice_id, amount, paid_at, status, method, method_detail, method_last4, reference, expense_created, expense_id')
    .eq('id', id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

  const next = {
    amount: 'amount' in raw ? r2(n(raw.amount)) : n(before.amount),
    method: 'method' in raw ? (raw.method || null) : before.method,
    method_detail: 'method_detail' in raw ? (raw.method_detail || null) : before.method_detail,
    method_last4: 'method_last4' in raw ? (raw.method_last4 || null) : before.method_last4,
    paid_at: 'paid_at' in raw ? (raw.paid_at || null) : before.paid_at,
    reference: 'reference' in raw ? (raw.reference || null) : before.reference,
  }
  if (!Number.isFinite(next.amount) || next.amount <= 0) {
    return NextResponse.json({ error: 'A positive amount is required' }, { status: 400 })
  }

  const amountChanged = Math.abs(next.amount - n(before.amount)) > 0.005
  const methodChanged = next.method !== before.method
    || (next.method_detail || '') !== (before.method_detail || '')
    || (next.method_last4 || '') !== (before.method_last4 || '')
  const dateChanged = String(next.paid_at || '') !== String(before.paid_at || '')

  const { data: expense } = before.expense_id
    ? await supabase.from('expenses').select('id, amount, date, description').eq('id', before.expense_id).maybeSingle()
    : { data: null }
  const orphanWarning = before.expense_created && !before.expense_id

  // would this take the invoice past what it is for?
  const snap = await snapshot(supabase, before.invoice_id)
  const paidAfter = r2(snap.paid - (before.status === 'paid' ? n(before.amount) : 0) + (before.status === 'paid' ? next.amount : 0))
  const overpaid = paidAfter - snap.total
  const overpayWarning = overpaid > 0.005 ? { paid: paidAfter, total: snap.total, over: r2(overpaid) } : null

  const inv = snap.invoice
  const methodStr = next.method
    ? `${next.method}${next.method_detail ? ' ' + String(next.method_detail).trim() : ''}${next.method_last4 ? ' …' + next.method_last4 : ''}`
    : ''
  const newDescription = `Payment — ${inv?.title}${methodStr ? ' (' + methodStr + ')' : ''}`

  if (!confirmed) {
    return NextResponse.json({
      preview: true,
      before: { amount: n(before.amount), method: before.method, method_detail: before.method_detail, method_last4: before.method_last4, paid_at: before.paid_at, reference: before.reference },
      after: next,
      changed: { amount: amountChanged, method: methodChanged, paid_at: dateChanged },
      expense: expense
        ? {
            id: expense.id, amount: n(expense.amount), date: expense.date,
            will: {
              amount: amountChanged ? next.amount : n(expense.amount),
              date: dateChanged ? next.paid_at : expense.date,
              description: methodChanged ? newDescription : expense.description,
            },
            kept_in_place: true,
          }
        : null,
      orphan_warning: orphanWarning,
      overpay_warning: overpayWarning,
    })
  }

  const { error: pErr } = await supabase.from('invoice_payments').update(next).eq('id', id)
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  let expenseResult: any = null
  if (expense) {
    const patch: Record<string, any> = {}
    if (amountChanged) patch.amount = next.amount
    if (dateChanged && next.paid_at) patch.date = next.paid_at
    if (methodChanged) patch.description = newDescription
    if (Object.keys(patch).length) {
      // matched on the id the payment still points at — if the row moved out from
      // under us the update finds nothing and says so rather than writing blind
      const { data: updated, error: eErr } = await supabase.from('expenses')
        .update(patch).eq('id', expense.id).select('id, amount, date, description')
      if (eErr) {
        return NextResponse.json({
          error: `The payment was updated but its expense was not: ${eErr.message}`,
          payment_updated: true, expense_updated: false,
        }, { status: 500 })
      }
      expenseResult = updated && updated.length ? { ...updated[0], kept_in_place: true } : { missing: true }
    } else {
      expenseResult = { id: expense.id, unchanged: true }
    }
  }

  const { data: after } = await supabase.from('invoice_payments')
    .select('id, amount, paid_at, method, method_detail, method_last4, reference, status, expense_created, expense_id')
    .eq('id', id).maybeSingle()

  return NextResponse.json({
    ok: true, payment: after, expense: expenseResult,
    orphan_warning: orphanWarning, overpay_warning: overpayWarning,
  })
}
