import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'
import { loadProperty } from '@/lib/properties-db'
import { L, F } from '@/lib/design-tokens'
import PricingCalculator from '@/components/keyholder/PricingCalculator'

export const dynamic = 'force-dynamic'

/*  The pricing tab. Read-only for now, deliberately: it exists so the target
 *  nets can be CHOSEN against real numbers before anything is written. The write
 *  path lands once Katherine has set them here and confirmed.
 *
 *  Today's cleaning prices are read from the real bookings rather than from a
 *  settings table, because the settings tables disagree — 340 in
 *  property_settings, 299 in property_pricing — and the bookings are what guests
 *  were actually charged. */
export default async function PricingTab({ params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) redirect('/keyholder')
  if (!await hasPermission('money', 'view')) redirect('/keyholder')

  const { id } = await params
  const property = await loadProperty(id)
  if (!property) notFound()

  const supabase = createAdminClient()
  const [{ data: pricing }, { data: overrides }, { data: recent }] = await Promise.all([
    supabase.from('property_pricing').select('*').eq('property_id', id).maybeSingle(),
    supabase.from('pricing_overrides').select('start_date, end_date, rate, label').eq('property_id', id).order('start_date'),
    supabase.from('calendar_blocks')
      .select('platform, cleaning_fee, start_date')
      .eq('property_id', id).not('cleaning_fee', 'is', null)
      .order('start_date', { ascending: false }).limit(40),
  ])

  //  the most recent cleaning fee actually charged on each platform
  const todayCleaning: Record<string, number> = {}
  for (const b of recent || []) {
    const p = String(b.platform || '')
    if (p && todayCleaning[p] == null && Number(b.cleaning_fee) > 0) todayCleaning[p] = Number(b.cleaning_fee)
  }

  return (
    <div>
      <Link href="/keyholder/property" style={{ fontSize: '13px', color: L.link, textDecoration: 'none', fontWeight: 600 }}>
        ← Property
      </Link>
      <div style={{ fontFamily: F.mono, fontSize: '11px', letterSpacing: '.16em', textTransform: 'uppercase', color: L.inkMuted, marginTop: '14px' }}>
        {property.name}
      </div>
      <PricingCalculator
        propertyId={id}
        propertyName={property.name}
        base={Number(pricing?.base_rate) || property.nightly || 0}
        weekend={pricing?.weekend_rate != null ? Number(pricing.weekend_rate) : null}
        overrides={(overrides || []) as any}
        todayCleaning={todayCleaning as any}
        maxGuests={property.guests || 0}
      />
    </div>
  )
}
