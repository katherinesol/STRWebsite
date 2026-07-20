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
  const allowed = ['contractor_name', 'contractor_contact', 'property_id', 'title', 'notes', 'status']
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
