/** The one place that decides whether a direct booking still owes money.
 *
 *  DIRECT ONLY. Airbnb, VRBO and Houfy collect from the guest themselves, so
 *  "unpaid" is not a thing that can be true of a platform booking — the badge
 *  never appears on one, and nothing here is given a platform row to judge.
 *
 *  The three payment columns are SCHEDULED amounts; each has its own paid_at.
 *  Summing the amounts alone would count a scheduled-but-unsent payment as
 *  money received, so only instalments with a paid_at count toward paid.
 *
 *  Lived in MonthGrid and StayAgenda as two identical copies. One copy now:
 *  a rule that can drift between two screens is a rule that will. */

const n = (v: any) => Number(v) || 0

export function paidSoFar(s: any): number {
  return (
    (s.deposit_paid_at ? n(s.deposit_amount) : 0) +
    (s.second_paid_at ? n(s.second_payment_amount) : 0) +
    (s.final_paid_at ? n(s.final_payment_amount) : 0)
  )
}

export function outstanding(s: any): number {
  return n(s.total) - paidSoFar(s)
}

export function unpaid(s: any): boolean {
  return !!s.check_in && n(s.total) > 0 && outstanding(s) > 0.005
}

/** The columns every caller of the above must select, so a screen can't
 *  silently ask the question with half the answer loaded. */
export const PAYMENT_COLUMNS =
  'total, deposit_amount, deposit_paid_at, second_payment_amount, second_paid_at, final_payment_amount, final_paid_at'
