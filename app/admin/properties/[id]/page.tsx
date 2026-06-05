import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PropertySettingsForm from '@/components/admin/PropertySettingsForm'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East Suite',
  'royal-york-west': 'Royal York West Suite',
  'nickel-beach':    'Nickel Beach Retreat',
}

export default async function PropertyEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!PROPERTY_NAMES[id]) notFound()

  const supabase = createAdminClient()
  const { data: settings } = await supabase
    .from('property_settings')
    .select('*')
    .eq('property_id', id)
    .single()

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/admin/properties" style={{ fontSize: '11px', color: '#9A9A92', textDecoration: 'none', letterSpacing: '.06em' }}>← Properties</Link>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1, marginTop: '12px' }}>
          {PROPERTY_NAMES[id]}
        </h1>
      </div>
      <PropertySettingsForm propertyId={id} settings={settings} />
    </div>
  )
}
