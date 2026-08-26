import { NextRequest, NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

/*  The Accounts surface — READ ONLY, and deliberately so.
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

  const [{ data: accounts }, { data: rows }] = await Promise.all([
    supabase.from('bank_accounts').select('*').order('sort_order'),
    supabase.from('payments').select(
      'id, direction, amount, status, paid_at, due_date, method, account_id, reference, slot, note, invoice_id, booking_id, booking_kind',
    ).order('paid_at', { ascending: false }),
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

  return NextResponse.json({
    accounts: cards, cash, unknown, grid, years,
    total: tally(scoped),
    payments: scoped,
    generated_at: new Date().toISOString(),
  })
}

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100
