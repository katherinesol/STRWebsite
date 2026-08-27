import { createAdminClient } from '@/lib/supabase/server'

/** Stay counts and lifetime value, counted rather than stored.
 *
 *  The guests table has a returning_guest boolean that three creation paths used
 *  to set on any name match, including matches against a duplicate that was
 *  itself a first stay. Ten guests carry it; one has actually returned. Rather
 *  than correct ten rows and wait for the next path to get it wrong again, the
 *  answer is counted from the bookings themselves. A flag that can disagree with
 *  the bookings will eventually disagree with the bookings.
 *
 *  BOTH TABLES. A guest with one direct stay and one Airbnb stay has returned,
 *  and anything that reads only `bookings` says they have not. */

export type GuestStat = {
  /** TRIPS, not booking rows. Amanda has two rows at Nickel Beach — VRBO 14–16
   *  August, then Houfy 16–17 — which is one visit that changed platform
   *  mid-stay, not a guest who came back. Counting rows called her a returning
   *  guest; counting trips does not. */
  stays: number
  bookings: number
  direct: number
  platform: number
  lifetime: number
  firstStay: string | null
  lastStay: string | null
  returning: boolean
}

export async function guestStats(): Promise<Record<string, GuestStat>> {
  const supabase = createAdminClient()
  const [{ data: direct }, { data: plat }] = await Promise.all([
    supabase.from('bookings')
      .select('guest_id, property_id, check_in, check_out, total, status')
      .not('guest_id', 'is', null).neq('status', 'cancelled'),
    supabase.from('calendar_blocks')
      .select('guest_id, property_id, start_date, end_date, payout_amount, accommodation')
      // a cancelled stay is not a stay, and its money is not lifetime value
      .neq('status', 'cancelled')
      .eq('is_booking', true).not('guest_id', 'is', null),
  ])

  type Row = { guestId: string; property: string; from: string | null; to: string | null; value: number; kind: 'direct' | 'platform' }
  const rows: Row[] = [
    ...(direct || []).map(b => ({
      guestId: b.guest_id!, property: b.property_id, from: b.check_in, to: b.check_out,
      /* What the guest owed. A booking with no total contributes nothing rather
         than a zero that reads as free — Per and Mikaela are exactly that. */
      value: Number(b.total) || 0, kind: 'direct' as const,
    })),
    ...(plat || []).map(b => ({
      guestId: b.guest_id!, property: b.property_id, from: b.start_date, to: b.end_date,
      /* Payout, not guest total: what the stay was worth to you after the
         platform's cut. Falls back to accommodation on unenriched rows. */
      value: Number(b.payout_amount) || Number(b.accommodation) || 0, kind: 'platform' as const,
    })),
  ]

  const byGuest: Record<string, Row[]> = {}
  for (const r of rows) (byGuest[r.guestId] ||= []).push(r)

  const out: Record<string, GuestStat> = {}
  for (const [id, list] of Object.entries(byGuest)) {
    list.sort((a, b) => String(a.from).localeCompare(String(b.from)))

    /* Collapse rows that run into each other at the same property. One row's
       checkout being the next one's check-in is a guest who never left. */
    let trips = 0
    let prev: Row | null = null
    for (const r of list) {
      const continues = prev && prev.property === r.property && prev.to && r.from && r.from <= prev.to
      if (!continues) trips++
      prev = r
    }

    out[id] = {
      stays: trips,
      bookings: list.length,
      direct: list.filter(r => r.kind === 'direct').length,
      platform: list.filter(r => r.kind === 'platform').length,
      lifetime: Math.round(list.reduce((s, r) => s + r.value, 0) * 100) / 100,
      firstStay: list[0]?.from ?? null,
      lastStay: list.reduce<string | null>((m, r) => (r.from && (!m || r.from > m) ? r.from : m), null),
      returning: trips > 1,
    }
  }
  return out
}
