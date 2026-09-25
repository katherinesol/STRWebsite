import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { requireArea } from '@/lib/require-area'
import { createAdminClient } from '@/lib/supabase/server'

/*  The Accounts surface — the GET reads and writes nothing, and that is still
 *  deliberate. A POST was added below on 2026-09-25 so a new account can be
 *  named from the expense form; it creates a bank_accounts row and touches no
 *  payment, no invoice and no expense. The paragraph below is about the READ,
 *  which is unchanged.
 *
 *  The Accounts READ — READ ONLY, and deliberately so.
 *
 *  It reads `payments` and `bank_accounts` and writes nothing at all. That is
 *  the whole reason it could be built first: invoice_payments remains the live
 *  source of truth for every existing screen, none of which changes, so a wrong
 *  figure here cannot corrupt anything — it can only be wrong on screen, where
 *  it is checkable against the database.
 *
 *  THE THREE BUCKETS ARE NOT COSMETIC. A payment with no account_id is one of
 *  two entirely different things, and merging them would hide the very gap this
 *  surface exists to expose:
 *
 *    cash      — no bank account by nature. Nothing is missing. A statement.
 *    unknown   — money that landed somewhere and nobody wrote down where.
 *                RS-1002's deposit and final payment are e-transfers whose
 *                destination the bookings table never had a column for. A prompt.
 *
 *  The split keys off `method`, not off a hardcoded list of ids, so a future
 *  accountless e-transfer sorts itself into `unknown` without anyone
 *  remembering to add it.
 *
 *  MOVEMENT, NOT BALANCE. bank_accounts carries no opening balance and payments
 *  begins in February 2026, so every total here is money that moved in a window
 *  — never a position that reconciles to a bank statement. The UI says so in
 *  words; this comment says so for whoever adds opening balances later. */

export async function GET(request: NextRequest) {
  if (!await hasRole('owner', 'co-owner')) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  const supabase = createAdminClient()
  const year = request.nextUrl.searchParams.get('year')   // '2026' | 'all'

  const [{ data: accounts }, { data: rows }, { data: sourceRows }] = await Promise.all([
    supabase.from('bank_accounts').select('*').order('sort_order'),
    supabase.from('payments').select(
      'id, direction, amount, status, paid_at, due_date, method, account_id, reference, slot, note, invoice_id, booking_id, booking_kind, source_payment_id',
    ).order('paid_at', { ascending: false }),
    supabase.from('invoice_payments').select('id, amount, paid_at'),
  ])

  const all = rows || []
  const inWindow = (r: any) =>
    !year || year === 'all' || (r.paid_at || '').startsWith(year)
  const scoped = all.filter(inWindow)

  const n = (v: any) => Number(v || 0)
  const tally = (list: any[]) => {
    const inSum = list.filter(r => r.direction === 'in').reduce((a, b) => a + n(b.amount), 0)
    const outSum = list.filter(r => r.direction === 'out').reduce((a, b) => a + n(b.amount), 0)
    return { in: r2(inSum), out: r2(outSum), net: r2(inSum - outSum), count: list.length }
  }

  // which bucket a payment belongs to — see the note above
  const bucketOf = (r: any) =>
    r.account_id ? r.account_id : (r.method === 'cash' ? 'cash' : 'unknown')

  const cards = (accounts || []).map(a => ({
    ...a,
    ...tally(scoped.filter(r => r.account_id === a.id)),
  }))
  const cash = tally(scoped.filter(r => bucketOf(r) === 'cash'))
  const unknownRows = scoped.filter(r => bucketOf(r) === 'unknown')
  const unknown = { ...tally(unknownRows), rows: unknownRows }

  // month grid: one row per month, one column per account plus unknown and cash
  const months = [...new Set(scoped.filter(r => r.paid_at).map(r => r.paid_at.slice(0, 7)))].sort()
  const grid = months.map(m => {
    const inMonth = scoped.filter(r => (r.paid_at || '').startsWith(m))
    const cells: Record<string, number> = {}
    for (const a of accounts || []) cells[a.id] = tally(inMonth.filter(r => r.account_id === a.id)).net
    cells.unknown = tally(inMonth.filter(r => bucketOf(r) === 'unknown')).net
    cells.cash = tally(inMonth.filter(r => bucketOf(r) === 'cash')).net
    return { month: m, cells, net: tally(inMonth).net }
  })

  const years = [...new Set(all.filter(r => r.paid_at).map(r => r.paid_at.slice(0, 4)))].sort().reverse()

  /*  STALENESS. The invoice panel still writes invoice_payments and nothing
   *  writes payments, so a payment logged after the migration appears on the
   *  Invoices screen and is invisible here — this view would quietly understate
   *  what left an account, with nothing on screen to say so.
   *
   *  Counting the invoice_payments rows no payments row claims turns that
   *  silence into a number. It is read-only and cannot drift; it simply makes
   *  the growing gap visible until the invoice read/write switch closes it.
   *  Right now it is zero, which is the honest answer, not a hidden one. */
  const claimed = new Set(all.map(r => r.source_payment_id).filter(Boolean))
  const unmirrored = (sourceRows || []).filter(r => !claimed.has(r.id))
  const staleness = {
    count: unmirrored.length,
    total: r2(unmirrored.reduce((a, b) => a + n(b.amount), 0)),
    rows: unmirrored.map(r => ({ amount: n(r.amount), paid_at: r.paid_at })),
  }

  return NextResponse.json({
    accounts: cards, cash, unknown, grid, years, staleness,
    total: tally(scoped),
    payments: scoped,
    generated_at: new Date().toISOString(),
  })
}

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

/*  Create an account from wherever one is needed — today the expense form.
 *
 *  THE ROUTE WAS READ-ONLY, so "which account paid this?" could only ever be
 *  answered with one of the three that already existed. A new card meant a
 *  database trip, which in practice means the expense gets filed with no
 *  account at all and the reconciliation gap widens quietly.
 *
 *  NAME ONLY, PLUS AN OPTIONAL LAST FOUR. No balances, no institution, nothing
 *  that would have to be kept accurate — this exists so an expense can point at
 *  something, and anything more would be a second source of truth for figures
 *  the statement already holds.
 *
 *  A DUPLICATE NAME RETURNS THE EXISTING ROW rather than creating a second one.
 *  Two "BMO Business" accounts would split a reconciliation in half and neither
 *  side would look wrong. */
export async function POST(request: NextRequest) {
  const no = await requireArea('money', 'edit')
  if (no) return no

  const { name, last4 } = await request.json().catch(() => ({} as any))
  const clean = String(name || '').trim()
  if (!clean) return NextResponse.json({ error: 'An account needs a name.' }, { status: 400 })
  if (clean.length > 60) return NextResponse.json({ error: 'That name is too long.' }, { status: 400 })

  const digits = String(last4 || '').replace(/\D/g, '').slice(-4) || null
  const supabase = createAdminClient()

  const { data: existing } = await supabase.from('bank_accounts')
    .select('id, name, last4').ilike('name', clean).maybeSingle()
  if (existing) return NextResponse.json({ ok: true, account: existing, existed: true })

  const { data: last } = await supabase.from('bank_accounts')
    .select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await supabase.from('bank_accounts')
    .insert({ name: clean, last4: digits, active: true, sort_order: ((last?.sort_order ?? 0) + 1) })
    .select('id, name, last4').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, account: data, existed: false })
}
