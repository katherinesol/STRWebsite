import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

/*  ASSIGN — put an account on a payment that never recorded one.
 *
 *  The narrowest write in the system, and deliberately so. It sets two fields on
 *  one row and cannot touch a money figure, because it does not accept one: the
 *  allowlist is account_id and reference, and anything else in the body is
 *  rejected BY NAME rather than ignored. Silently dropping an unexpected field
 *  is how a caller comes to believe it wrote something it did not.
 *
 *  WHY IT REFUSES MIRRORED ROWS. Twenty-one payments were copied from
 *  invoice_payments and still carry source_payment_id. For those, the account of
 *  record is invoice_payments.method_last4 — invoice_payments is still the live
 *  source of truth, because the invoice panel writes to it and nothing has
 *  switched. Setting account_id here would make the two disagree with no way to
 *  tell which was right, which is precisely the drift this build exists to
 *  prevent.
 *
 *  Rows born in payments — RS-1002's two e-transfers, and anything logged here
 *  in future — have no counterpart, so writing them cannot desynchronise
 *  anything. That is the whole rule: assignable if nothing else holds the fact.
 *
 *  The same invariant is enforced by a database trigger. This check exists to
 *  give a useful 409 rather than a raw exception; the trigger exists because an
 *  invariant about money should not depend on every future caller remembering. */

const EDITABLE = new Set(['account_id', 'reference'])

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  const { id } = await params
  const raw = await request.json().catch(() => ({}))

  const rejected = Object.keys(raw || {}).filter(k => !EDITABLE.has(k))
  if (rejected.length) {
    return NextResponse.json({
      error: 'Assign only sets an account and a reference',
      rejected,
      detail: 'Amounts, dates, direction and parentage are not editable here — this endpoint does not accept them.',
    }, { status: 400 })
  }
  if (!('account_id' in raw)) {
    return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // read the row from the database — never trust the client's idea of its state
  const { data: before, error: readErr } = await supabase.from('payments')
    .select('id, direction, amount, status, paid_at, method, account_id, reference, source_payment_id, invoice_id, booking_id, booking_kind')
    .eq('id', id).maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!before) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

  if (before.source_payment_id) {
    return NextResponse.json({
      error: 'This payment mirrors an invoice_payments row and cannot be assigned here',
      detail: 'Its account of record is invoice_payments.method_last4 until the invoice read/write switch. Assigning it here would make the two disagree.',
      source_payment_id: before.source_payment_id,
    }, { status: 409 })
  }

  // the account must be real and active — checked against the table, not assumed
  if (raw.account_id !== null) {
    const { data: acct } = await supabase.from('bank_accounts')
      .select('id, name, active').eq('id', raw.account_id).maybeSingle()
    if (!acct) return NextResponse.json({ error: 'No such bank account' }, { status: 400 })
    if (!acct.active) return NextResponse.json({ error: `${acct.name} is not an active account` }, { status: 400 })
  }

  const patch: Record<string, any> = { account_id: raw.account_id }
  if ('reference' in raw) patch.reference = raw.reference || null

  const { data: after, error: wErr } = await supabase.from('payments')
    .update(patch).eq('id', id)
    .select('id, direction, amount, status, paid_at, method, account_id, reference, source_payment_id')
    .maybeSingle()
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 })

  // prove the money did not move, rather than asserting it
  const untouched = ['direction', 'amount', 'status', 'paid_at', 'method'] as const
  const changed = untouched.filter(k => String((before as any)[k]) !== String((after as any)[k]))

  return NextResponse.json({
    ok: true,
    before: { account_id: before.account_id, reference: before.reference },
    after: { account_id: after!.account_id, reference: after!.reference },
    unchanged_verified: changed.length === 0,
    unexpectedly_changed: changed,
  })
}
