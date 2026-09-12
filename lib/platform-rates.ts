/*  The rates, read from the table instead of hardcoded.
 *
 *  THE POINT IS THAT READ AND WRITE CANNOT DIVERGE. lib/gross-up.ts already
 *  takes the rates as an argument, and the calculator has been passing
 *  CURRENT_RATES — a constant in the source. The moment the write path started
 *  reading platform_rates, there would be two answers to "what does Airbnb
 *  take": the constant Katherine saw when she chose a target, and the row the
 *  saved price is computed from. They agree today and would disagree the first
 *  time a rate moved, and the number she decided against would not be the number
 *  that went live.
 *
 *  So there is ONE source: this loader. Both the calculator and anything that
 *  prices a booking read it, and both hand the result to the same quote().
 *  CURRENT_RATES stays only as the fallback for when the table cannot be read,
 *  and a fallback that silently disagrees is worse than none — so a mismatch is
 *  logged loudly rather than smoothed over.
 *
 *  ASOF IS THE BOOKING DATE, NOT THE STAY DATE. Airbnb's 3% and 15.5% rows
 *  interleave by stay and separate cleanly by when the reservation was made —
 *  see the comment on platform_rates. Pass the date the booking was taken, or
 *  today for a quote. */

import { createAdminClient } from '@/lib/supabase/server'
import { CURRENT_RATES, type PlatformRate, type Platform } from '@/lib/gross-up'

export async function loadPlatformRates(asOf: Date = new Date()): Promise<PlatformRate[]> {
  const day = asOf.toISOString().slice(0, 10)
  try {
    const { data, error } = await createAdminClient()
      .from('platform_rates')
      .select('platform, commission_pct, processing_pct, processing_on_tax_inclusive, effective_from')
      .lte('effective_from', day)
      .order('effective_from', { ascending: false })
    if (error) throw error

    //  the newest row on or before the date wins, per platform
    const picked = new Map<Platform, PlatformRate>()
    for (const r of data || []) {
      const p = r.platform as Platform
      if (picked.has(p)) continue
      picked.set(p, {
        platform: p,
        commissionPct: Number(r.commission_pct),
        processingPct: Number(r.processing_pct),
        processingOnTaxInclusive: !!r.processing_on_tax_inclusive,
      })
    }
    const out = CURRENT_RATES.map(f => picked.get(f.platform) ?? f)
    if (picked.size !== CURRENT_RATES.length) {
      console.error('[platform-rates] table is missing a platform for', day,
        '— falling back to the constant for:', CURRENT_RATES.filter(f => !picked.has(f.platform)).map(f => f.platform))
    }
    return out
  } catch (e) {
    console.error('[platform-rates] table read failed, using the constant in lib/gross-up.ts:', e)
    return CURRENT_RATES
  }
}
