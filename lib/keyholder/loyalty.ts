/*  Milestones: a signal to Kaye, never an action.
 *
 *  The system's job here is to make sure she KNOWS a guest has come back for
 *  the fifth time. It is emphatically not to decide what that is worth. Every
 *  perk is hers to choose, every time — so nothing in this file grants,
 *  discounts, emails or credits anything. It raises a flag and stops.
 *
 *  THE TOTAL IS DERIVED PLUS DECLARED.
 *
 *      loyalty = completed trips (counted, never stored)
 *              + prior_stays     (typed once, for history predating this system)
 *
 *  Counted, because the guests table already demonstrates what happens
 *  otherwise: returning_guest is true on ten rows and one of those guests has
 *  actually returned. Declared for the other half, because no amount of counting
 *  recovers a stay that happened before there was anything to count it.
 *
 *  COMPLETED, NOT BOOKED. A stay is earned when it has been taken — checkout in
 *  the past. Someone with four stays and a booking for next week has four, and
 *  becomes a fifth-stay guest the day after they leave. Counting the future
 *  would congratulate people for arriving. */

import { createAdminClient } from '@/lib/supabase/server'
import type { GuestStat } from '@/lib/keyholder/guest-stats'

export type Milestone = { stays: number; label: string; note: string | null; active: boolean }
export type Ack = { guest_id: string; stays: number; outcome: 'seen' | 'gift'; note: string | null; acknowledged_at: string }

export type LoyaltyFlag = {
  guestId: string
  /** completed + prior_stays */
  total: number
  completed: number
  prior: number
  /** the highest milestone reached and not yet handled; null when nothing is due */
  due: Milestone | null
  /** everything reached, handled or not — for the detail page */
  reached: Milestone[]
  acks: Ack[]
}

export async function loadMilestones(): Promise<Milestone[]> {
  const { data } = await createAdminClient()
    .from('loyalty_milestones').select('stays, label, note, active').order('stays')
  return (data || []).filter((m: any) => m.active) as Milestone[]
}

export async function loadAcks(): Promise<Record<string, Ack[]>> {
  const { data } = await createAdminClient()
    .from('loyalty_acknowledgements').select('guest_id, stays, outcome, note, acknowledged_at')
  const out: Record<string, Ack[]> = {}
  for (const a of (data || []) as any[]) (out[a.guest_id] ||= []).push(a)
  return out
}

/** Pure, so the rule can be exercised without a database. */
export function flagFor(
  guestId: string,
  stat: Pick<GuestStat, 'completed'> | undefined,
  priorStays: number,
  milestones: Milestone[],
  acks: Ack[],
): LoyaltyFlag {
  const completed = stat?.completed ?? 0
  const prior = Math.max(0, Number(priorStays) || 0)
  const total = completed + prior
  const reached = milestones.filter(m => total >= m.stays)
  const handled = new Set(acks.map(a => a.stays))
  //  the HIGHEST unhandled one. A guest who jumps from 2 to 6 is a fifth-stay
  //  guest once, not a third-stay and a fifth-stay guest twice over.
  const due = [...reached].reverse().find(m => !handled.has(m.stays)) ?? null
  return { guestId, total, completed, prior, due, reached, acks }
}
