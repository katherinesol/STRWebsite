import { NextRequest, NextResponse } from 'next/server'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

/*  Non-booking income — money that arrives with no booking and no invoice.
 *
 *  A damage recovery, an insurance settlement, a refund received. Real income
 *  that until now had nowhere to live: Heremela's $2,464.57 existed only as a
 *  sentence in the reconciliation ledger, so a P&L built from the tables would
 *  have understated revenue by exactly that and looked complete doing it.
 *
 *  It writes a standalone row on `payments` rather than to a table of its own,
 *  because it IS money that hit a bank account and belongs on the Accounts
 *  surface with everything else. `kind` is what makes it standalone — set here,
 *  and refused by the database on any row that has a parent, so deliberate
 *  income can never be confused with a booking payment that lost its parent.
 *
 *  What it will not do: record money going OUT. That is an expense and `expenses`
 *  owns it. The database refuses it too — standalone is 'in' only. */

const KINDS = ['damage_recovery', 'insurance', 'refund_received', 'other'] as const
const EDITABLE = new Set(['amount', 'paid_at', 'kind', 'property_id', 'account_id', 'reference', 'note', 'method'])

export async function GET() {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('payments')
    .select('id, amount, paid_at, kind, property_id, account_id, reference, note, method, created_at')
    // kind is no longer unique to standalone income: a refund is a booking-
    // parented row that also carries one. Direction is what separates them,
    // and the constraint guarantees standalone is always 'in'.
    .not('kind', 'is', null).eq('direction', 'in').is('booking_id', null)
    .order('paid_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: data || [], kinds: KINDS })
}

export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const raw = await request.json().catch(() => ({}))

  const rejected = Object.keys(raw || {}).filter(k => !EDITABLE.has(k))
  if (rejected.length) {
    return NextResponse.json({
      error: 'Not a field on a non-booking income entry', rejected,
      detail: 'Parentage and direction are not settable here — this is always standalone income.',
    }, { status: 400 })
  }

  const amount = Number(raw.amount)
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: 'A non-zero amount is required' }, { status: 400 })
  }
  if (amount < 0) {
    return NextResponse.json({
      error: 'Income is a positive amount',
      detail: 'Money going out is an expense — record it on the Expenses screen.',
    }, { status: 400 })
  }
  if (!KINDS.includes(raw.kind)) {
    return NextResponse.json({ error: `kind must be one of: ${KINDS.join(', ')}` }, { status: 400 })
  }
  if (!raw.paid_at) return NextResponse.json({ error: 'A date is required' }, { status: 400 })

  const supabase = createAdminClient()

  // the account must be real and active — read from the table, never assumed
  if (raw.account_id) {
    const { data: acct } = await supabase.from('bank_accounts')
      .select('id, name, active').eq('id', raw.account_id).maybeSingle()
    if (!acct) return NextResponse.json({ error: 'No such bank account' }, { status: 400 })
    if (!acct.active) return NextResponse.json({ error: `${acct.name} is not an active account` }, { status: 400 })
  }

  const who = await getAuth()
  const { data, error } = await supabase.from('payments').insert({
    direction: 'in',
    invoice_id: null, booking_id: null, booking_kind: null,
    kind: raw.kind,
    amount, currency: 'CAD', status: 'paid',
    paid_at: new Date(raw.paid_at).toISOString(),
    property_id: raw.property_id || null,
    account_id: raw.account_id || null,
    reference: raw.reference || null,
    method: raw.method || null,
    note: raw.note || null,
    created_by: who.ok ? who.userId : null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data })
}

export async function DELETE(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createAdminClient()

  // only ever a standalone row — a booking or invoice payment is not deletable here
  const { data: row } = await supabase.from('payments').select('id, kind').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!row.kind) {
    return NextResponse.json({
      error: 'That is not a non-booking income entry',
      detail: 'It belongs to a booking or an invoice and cannot be deleted from here.',
    }, { status: 409 })
  }
  const { error } = await supabase.from('payments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted: row.id })
}
