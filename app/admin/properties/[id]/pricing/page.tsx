import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import PricingManager from '@/components/admin/PricingManager'

export const dynamic = 'force-dynamic'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East Suite',
  'royal-york-west': 'Royal York West Suite',
  'nickel-beach': 'Nickel Beach Retreat',
}

export default async function PricingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: config }, { data: overrides }] = await Promise.all([
    supabase.from('property_pricing').select('*').eq('property_id', id).maybeSingle(),
    supabase.from('pricing_overrides').select('*').eq('property_id', id).order('start_date'),
  ])

  const safeConfig = config || { property_id: id, base_rate: 200, weekend_rate: null, min_stay: 2, cleaning_fee: 0 }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/admin/properties" style={{ fontSize: '11px', color: '#9A9A92', textDecoration: 'none' }}>← Properties</Link>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F5F2EC', marginTop: '8px' }}>
          {PROPERTY_NAMES[id] || id} — pricing.
        </h1>
      </div>
      <PricingManager propertyId={id} initialConfig={safeConfig} initialOverrides={overrides || []} />
    </div>
  )
}
