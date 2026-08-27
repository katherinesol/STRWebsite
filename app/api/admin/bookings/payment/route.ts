import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission, getAuth } from '@/lib/auth'
import { pick, rejection } from '@/lib/allowlist'

/*  Recording an instalment received on a direct booking.
 *
 *  THE GAP THIS CLOSES. Marking a deposit paid used to be a timestamp flip:
 *  PATCH /api/admin/bookings/[id] sets deposit_paid_at and writes nothing else.
 *  That route contains no reference to the payments table at all. So the money
 *  showed as received on the booking and did not exist in the ledger the
 *  Accounts surface and the P&L read — the two direct payments that ARE in
 *  payments both say "Migrated from the bookings payment-schedule columns", a
 *  one-off backfill on 2026-08-24 with nothing keeping them in step since.
 *  Anything marked paid after that date diverged silently.
 *
 *  So this writes BOTH, in one request: a real payments row, and the stamp on
 *  the booking that the schedule UI reads. Neither alone is the truth.
 *
 *  AN ACCOUNT IS MANDATORY, which is the rule stage 3 of the payment work
 *  established and the reason RS-1002's two e-transfers were deliberately left
 *  with account_id null rather than guessed. Money that arrived somewhere
 *  nobody named cannot be reconciled against a statement, so it is refused here
 *  rather than recorded as a mystery.
 *
 *  THE PAYMENTS ROW CARRIES NO `kind`. payments_one_parent admits a booking
 *  row only as (booking parent, kind null) or as the refund shape (out +
 *  kind 'refund'). An instalment coming IN is the first of those, and `slot`
 *  is what says which instalment it is. */

const SLOTS = { deposit: 'deposit_paid_at', second: 'second_paid_at', final: 'final_paid_at' } as const
const AMOUNTS = { deposit: 'deposit_amount', second: 'second_payment_amount', final: 'final_payment_amount' } as const
type Slot = keyof typeof SLOTS

const ACCEPTED = ['booking_id', 'slot', 'amount', 'paid_at', 'account_id', 'method', 'reference', 'note'] as const

export async function POST(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('money', 'edit')) return NextResponse.json({ error: 'Not allowed to record payments' }, { status: 403 })

  const p = pick(await request.json().catch(() => null), ACCEPTED)
  if (!p.ok) return NextResponse.json(rejection(p.rejected, ACCEPTED), { status: 400 })
  const f = p.fields as any

  const slot: Slot = f.slot
  if (!SLOTS[slot]) return NextResponse.json({ error: "slot must be 'deposit', 'second' or 'final'" }, { status: 400 })
  if (!f.booking_id) return NextResponse.json({ error: 'booking_id is required' }, { status: 400 })
  if (!f.paid_at) return NextResponse.json({ error: 'A payment has a date it was received on.' }, { status: 400 })

  /*  No account, no record. See the header — a payment nobody can match to a
      statement is worse than one not yet entered, because it looks complete. */
  if (!f.account_id) {
    return NextResponse.json({
      error: 'Which account received this?',
      detail: 'Every recorded payment names the account it landed in, so the Accounts surface balances and a '
        + 'statement can be matched against it later.',
    }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: acct } = await supabase.from('bank_accounts').select('id, name, active').eq('id', f.account_id).maybeSingle()
  if (!acct) return NextResponse.json({ error: 'No such bank account' }, { status: 400 })
  if (!acct.active) return NextResponse.json({ error: `${acct.name} is not an active account` }, { status: 400 })

  const { data: b } = await supabase.from('bookings')
    .select('id, booking_reference, property_id, status, deposit_amount, deposit_paid_at, second_payment_amount, second_paid_at, final_payment_amount, final_paid_at')
    .eq('id', f.booking_id).maybeSingle()
  if (!b) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const stampCol = SLOTS[slot]
  if ((b as any)[stampCol]) {
    return NextResponse.json({
      error: `The ${slot} instalment is already marked received.`,
      detail: 'Recording it twice would double it in the ledger. Edit the existing payment instead.',
      received_at: (b as any)[stampCol],
    }, { status: 409 })
  }

  const scheduled = Number((b as any)[AMOUNTS[slot]]) || 0
  const amount = f.amount != null ? Math.round((Number(f.amount) + Number.EPSILON) * 100) / 100 : scheduled
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'A received payment is a positive amount.' }, { status: 400 })
  }

  const who = await getAuth()

  /*  LEDGER FIRST. If the stamp landed and the payment row failed, the booking
      would claim money the books have never seen — the exact divergence this
      exists to end. Written the other way round, a failure after the insert
      leaves a payment that is real and a stamp that can be set by hand. */
  const { data: row, error } = await supabase.from('payments').insert({
    direction: 'in',
    booking_id: b.id, booking_kind: 'direct', invoice_id: null,
    kind: null,
    amount, currency: 'CAD', status: 'paid',
    paid_at: new Date(f.paid_at).toISOString(),
    account_id: f.account_id,
    method: f.method || null,
    reference: f.reference || null,
    slot,
    property_id: b.property_id,
    note: [`${slot[0].toUpperCase()}${slot.slice(1)} instalment on ${b.booking_reference || b.id}.`,
           scheduled && Math.abs(scheduled - amount) > 0.005
             ? `Scheduled ${scheduled.toFixed(2)}, received ${amount.toFixed(2)}.` : '',
           f.note ? String(f.note) : ''].filter(Boolean).join(' '),
    created_by: who.ok ? who.userId : null,
  }).select('id, amount, paid_at, account_id, slot').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  /*  Then the stamp the schedule UI reads. A deposit additionally confirms the
      booking, which is what the legacy button did and remains right: money in
      is what turns a held booking into a confirmed one. */
  const patch: Record<string, any> = { [stampCol]: new Date(f.paid_at).toISOString() }
  if (slot === 'deposit' && b.status === 'pending_payment') patch.status = 'confirmed'

  const { error: bErr } = await supabase.from('bookings').update(patch).eq('id', b.id)
  if (bErr) {
    return NextResponse.json({
      error: `The payment was recorded but the booking stamp did not update: ${bErr.message}`,
      payment: row, action_needed: `Set ${stampCol} on ${b.booking_reference || b.id} by hand.`,
    }, { status: 500 })
  }

  return NextResponse.json({
    ok: true, payment: row,
    booking: { id: b.id, reference: b.booking_reference, [stampCol]: patch[stampCol], status: patch.status ?? b.status },
    account: acct.name,
    ledger: 'Recorded in payments — it will appear on the Accounts surface and net in the P&L.',
  })
}
