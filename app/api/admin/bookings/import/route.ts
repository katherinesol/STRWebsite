import { NextResponse } from 'next/server'

/*  RETIRED 2026-08-25 — this route never once succeeded, and is deliberately not
 *  being repaired.
 *
 *  Both branches were broken from the start. The direct branch inserted into
 *  `bookings` without `guests`, which is NOT NULL with no default (23502). The
 *  platform branch inserted `check_in`/`check_out` into `calendar_blocks`, which
 *  has `start_date`/`end_date` and no such columns (PGRST204) — it set both
 *  pairs, so the right two were present but the wrong two poisoned the insert.
 *  Confirmed by running exactly what it inserted, and by the absence of any row
 *  bearing its signature: no booking with status='completed' +
 *  payment_method='etransfer', no calendar block noted "Imported - …".
 *
 *  The two fixes were one line each. They were not applied, because a WORKING
 *  version of this route is the thing worth avoiding: it writes amount_paid and
 *  accommodation with no HST/MAT computation, no payout reconciliation and no
 *  guest link on the platform branch. That is precisely the hole that
 *  /api/admin/income/update was deleted for on 2026-08-24. Repairing this would
 *  rebuild a tax-bypass next to the endpoint built to replace it.
 *
 *  Bookings with money now go through POST /api/admin/calendar/block/[id]/figures,
 *  which computes tax through lib/tax-rates.ts, refuses typed HST/MAT, checks the
 *  payout to two cents and links the guest only on a certain match. The historical
 *  backfill (1 Jan – 15 May 2026) wants that path, not this one.
 *
 *  Nothing is lost by retiring it: it has no successful run to preserve, so there
 *  is no data and no workflow depending on it. The link on /admin/bookings has
 *  been removed. */

const GONE = {
  error: 'Booking import has been retired',
  detail: 'This route never worked and was not repaired: it wrote money figures while skipping the tax engine. Create the booking, then put its figures through /api/admin/calendar/block/[id]/figures.',
  retired_on: '2026-08-25',
}

export async function POST() { return NextResponse.json(GONE, { status: 410 }) }
export async function GET()  { return NextResponse.json(GONE, { status: 410 }) }
