import { redirect } from 'next/navigation'

/*  Retired — superseded by the lock queue.
 *
 *  This page generated and revoked rows in `access_codes`, which holds ZERO
 *  rows. Door codes have not lived there for some time: they are on
 *  `calendar_blocks.door_code` (30 of 43 bookings) and `bookings.lock_code`
 *  (3 of 4), written through `lock_actions` and drained by the Schlage worker.
 *  The queue is the mechanism; this was the thing it replaced.
 *
 *  Sent to door activity, which is the access section's live surface.
 *
 *  WHAT THIS ORPHANS, RECORDED SO A LATER AUDIT DOES NOT HAVE TO REDISCOVER IT:
 *  `components/admin/AccessManager.tsx` now has no page, and
 *  /api/admin/access/generate and /api/admin/access/[id]/revoke have no caller.
 *  They stay gated and harmless. That pattern — a component left with no page —
 *  is exactly how house-guide upload disappeared for three weeks, so it is
 *  written down at the moment it is created rather than found later.
 *
 *  The table itself is NOT dropped. /api/portal/booking reads it, the
 *  send-access-code route and its cron read it, and seven Schlage tools
 *  reference it. All of those find it empty today, which is a separate question
 *  from whether this page should exist. */
export default function LegacyRedirect() {
  redirect('/keyholder/access/door-activity')
}
