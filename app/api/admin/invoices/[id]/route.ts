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

// delete an invoice (cascades to items/adjustments/payments)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const { id } = await params
  const supabase = createAdminClient()
  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
