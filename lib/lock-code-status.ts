// Pure lock-code status reading — no Seam SDK, no database, no server imports, so
// it can be tested directly. Same reason lib/ical-parse.ts is separate from
// lib/ical-sync.ts: the judgement is the part worth testing, and it should not
// require a network or a real lock to exercise.

/** How a just-programmed code should be read, given that Seam confirms
 *  asynchronously.
 *
 *  The morning sweep used to re-list the lock immediately after creating a code
 *  and demand `status === 'set' || is_scheduled_on_device`. Neither can be true
 *  that quickly: a freshly created code reads `unset` with `on_device` false for
 *  roughly thirty seconds, and a future-dated code cannot report `set` at all
 *  until its window opens. The check therefore failed for every advance booking
 *  the sweep had just programmed correctly — two such emails arrived for one
 *  booking that was entirely fine. An alert that always fires is one that stops
 *  being read, which is precisely how a real failure gets through.
 *
 *  Absence and Seam's own errors are still failures, immediately. What changed is
 *  the unconfirmed-but-present case: that is `pending` while there is runway left
 *  for the next run to re-check, and becomes a failure once check-in is close
 *  enough that nobody would want to find out later. A code that never lands is
 *  therefore still surfaced — just not on the morning it was created.
 *
 *  Exported and pure so it can be tested against real observed Seam states
 *  without programming a lock. */
export type SeamCodeState = { status?: string; is_scheduled_on_device?: boolean; errors?: any[] } | null | undefined

export function classifyCode(
  code: SeamCodeState,
  hoursUntilCheckIn: number,
  graceHours = 12,
): { outcome: 'confirmed' | 'pending' | 'failed'; issue?: string } {
  if (!code) return { outcome: 'failed', issue: 'code was not created on the lock' }

  const errs = (code.errors || [])
    .map((e: any) => (typeof e === 'string' ? e : e?.message || e?.error_code))
    .filter(Boolean)
  if (errs.length) return { outcome: 'failed', issue: `Seam reported: ${errs.join('; ')}` }

  if (code.status === 'set' || code.is_scheduled_on_device) return { outcome: 'confirmed' }

  if (hoursUntilCheckIn > graceHours) return { outcome: 'pending' }
  return { outcome: 'failed', issue: `not confirmed with under ${graceHours}h to check-in` }
}
