import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// full invoice detail: items, adjustments, payments
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id } = await params
  const supabase = createAdminClient()
  const [{ data: invoice }, { data: items }, { data: adjustments }, { data: payments }] = await Promise.all([
    supabase.from('invoices').select('*').eq('id', id).maybeSingle(),
    supabase.from('invoice_items').select('*').eq('invoice_id', id).order('created_at'),
    supabase.from('invoice_adjustments').select('*').eq('invoice_id', id).order('created_at'),
    supabase.from('invoice_payments').select('*').eq('invoice_id', id).order('created_at'),
  ])
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ invoice, items, adjustments, payments })
}

// update invoice fields (title, notes, status, contractor)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id } = await params
  const body = await request.json()
  /*  HEADER ONLY, AND THAT IS THE POINT.
   *
   *  This route updates the invoices row and nothing else — no items, no
   *  payments, no expenses. That matters because the obvious alternative,
   *  /api/admin/invoices/save, is a FULL REPLACE: it deletes every item,
   *  adjustment and payment absent from the posted arrays, and every expense
   *  linked to a deleted payment. Posting identity fields there without also
   *  round-tripping the money would erase it. Editing a contractor's phone
   *  number must not be able to do that, so identity edits come here instead.
   *
   *  company, category and due_date were missing from this list, which is why
   *  the redesigned screen could not edit them at all. */
  const allowed = [
    'contractor_name', 'company', 'contractor_contact',
    'title', 'property_id', 'category', 'due_date', 'notes', 'status',
  ]
  const updates: any = {}
  for (const k of allowed) if (k in body) updates[k] = body[k]
  const supabase = createAdminClient()
  const { error } = await supabase.from('invoices').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/*  DELETE AN INVOICE, and say what that takes with it.
 *
 *  The database cascades to invoice_items, invoice_adjustments and
 *  invoice_payments — verified by deleting a scratch invoice and watching all
 *  three empty. What it does NOT cascade to is the expenses those payments
 *  filed: they survive, still counted in the books, with nothing left to explain
 *  them. Deleting an invoice used to orphan every expense it had produced.
 *
 *  So the expenses are removed here, explicitly, before the invoice goes. That
 *  is only possible for payments that recorded which expense was theirs; older
 *  ones that set expense_created without expense_id cannot be cleaned up, and
 *  the response says so rather than leaving it to be discovered.
 *
 *  Without ?confirm=true it deletes nothing and returns the full consequence, so
 *  a control can name it — "this also deletes 3 payments, 2 line items and 3
 *  expenses" — instead of asking someone to agree to the word "delete". */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id } = await params
  const confirmed = request.nextUrl.searchParams.get('confirm') === 'true'
  const supabase = createAdminClient()

  const { data: inv } = await supabase.from('invoices').select('id, title, contractor_name').eq('id', id).maybeSingle()
  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const [{ data: items }, { data: adjustments }, { data: payments }] = await Promise.all([
    supabase.from('invoice_items').select('id, amount').eq('invoice_id', id),
    supabase.from('invoice_adjustments').select('id, amount').eq('invoice_id', id),
    supabase.from('invoice_payments').select('id, amount, expense_id, expense_created').eq('invoice_id', id),
  ])
  const expenseIds = (payments || []).map(p => p.expense_id).filter(Boolean) as string[]
  const { data: expenses } = expenseIds.length
    ? await supabase.from('expenses').select('id, amount, description').in('id', expenseIds)
    : { data: [] as any[] }
  const unlinked = (payments || []).filter(p => p.expense_created && !p.expense_id).length

  if (!confirmed) {
    return NextResponse.json({
      preview: true,
      invoice: { title: inv.title, contractor_name: inv.contractor_name },
      counts: {
        items: (items || []).length,
        adjustments: (adjustments || []).length,
        payments: (payments || []).length,
        expenses: (expenses || []).length,
      },
      paid_total: (payments || []).reduce((t, p) => t + (Number(p.amount) || 0), 0),
      unlinked_expenses: unlinked,
    })
  }

  // the expenses first: if this fails, nothing else has been touched
  if (expenses && expenses.length) {
    const { error: eErr } = await supabase.from('expenses').delete().in('id', expenses.map(e => e.id))
    if (eErr) return NextResponse.json({ error: `Nothing was deleted — the expenses could not be removed: ${eErr.message}` }, { status: 500 })
  }
  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true, deleted: id,
    also_deleted: {
      items: (items || []).length, adjustments: (adjustments || []).length,
      payments: (payments || []).length, expenses: (expenses || []).length,
    },
    unlinked_expenses: unlinked,
  })
}
