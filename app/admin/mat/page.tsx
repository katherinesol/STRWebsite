import { redirect } from 'next/navigation'

/*  Migrated to /keyholder/money/tax.
 *
 *  NOT "because the numbers match today" — they do, and that is the weaker
 *  argument. They match because nothing in the current data exercises the places
 *  the two disagree: every Nickel Beach booking has apply_tax true, none runs to
 *  thirty nights, and none is direct. The divergence is latent, not absent.
 *
 *  The reason it is safe is that mat-return is a STRICT SUPERSET by
 *  construction. Everything this report did, it does — and three things this
 *  report did wrongly, it does correctly:
 *
 *    · the rate was `const RATE = 0.04`, Port Colborne's, hardcoded. It cannot
 *      produce a correct Toronto figure, which is why this page was pinned to
 *      one property. mat-return resolves the rate by property AND by date, so it
 *      carries Toronto's 8.5% to 6% change on 31 July 2026.
 *    · apply_tax was never selected, so a booking marked non-taxable — a
 *      reimbursement — would have been billed MAT anyway.
 *    · the 30-night exemption was `total > 29`, hardcoded, rather than
 *      matExempt(property, nights).
 *
 *  It was also hardcoded to nickel-beach and filtered to the three platforms, so
 *  the nineteen Royal York West bookings were invisible to it entirely.
 *
 *  ONE UI DIFFERENCE, AND IT IS NOT A CAPABILITY LOSS: the new tab has a
 *  property selector, so Nickel Beach is chosen rather than assumed. */
export default function LegacyRedirect() {
  redirect('/keyholder/money/tax')
}
