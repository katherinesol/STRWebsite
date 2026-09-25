import { redirect } from 'next/navigation'
import { hasPermission, hasRole } from '@/lib/auth'
import LocksSurface from '@/components/keyholder/LocksSurface'

/*  The lock surface, in the new shell and with no Seam in it.
 *
 *  The old /admin/locks was built on an account that is dead in both
 *  directions: its API key answers 401 and its webhook stopped delivering on 23
 *  September. Everything here comes from the queue the local worker drains and
 *  from what that worker read off the hardware.
 *
 *  Operating a lock is owner-only, matching set-code, which was already
 *  stricter than its neighbours. Reading is locks:view — the whole point of a
 *  view grant is the screen that says whether codes are healthy. */

export const dynamic = 'force-dynamic'

export default async function LocksPage() {
  if (!await hasPermission('locks', 'view')) redirect('/keyholder')
  const canOperate = await hasRole('owner') && await hasPermission('locks', 'edit')
  return <LocksSurface canOperate={canOperate} />
}
