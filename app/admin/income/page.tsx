import { redirect } from 'next/navigation'

/* Retired in favour of /keyholder/money/income.
 *
 *  This screen let hst and mat be typed straight onto a booking through
 *  /api/admin/income/update, which skipped the tax engine, the guest link and
 *  the payout check. That is the shape of write that left a $1,038 payout
 *  invisible to income, the MAT return and Today, and it produced a good deal
 *  of the wrong tax data corrected during the 2026 reconciliation. The route is
 *  deleted, not merely unlinked, because an unlinked route is still a live
 *  endpoint.
 *
 *  Income is read-only now. Corrections go through the booking's figures panel,
 *  where computeTaxSplit runs and the payout has to reconcile. */
export default function LegacyIncomeRedirect() {
  redirect('/keyholder/money/income')
}
