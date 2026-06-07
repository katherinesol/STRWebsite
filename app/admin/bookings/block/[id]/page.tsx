import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import Link from 'next/link'
import PlatformBookingForm from '@/components/admin/PlatformBookingForm'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East Suite',
  'royal-york-west': 'Royal York West Suite',
  'nickel-beach':    'Nickel Beach Retreat',
}

export default async function PlatformBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: block } = await supabase
    .from('calendar_blocks')
    .select('*')
    .eq('id', id)
    .single()

  if (!block) notFound()

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/admin/bookings?tab=platform" style={{ fontSize: '11px', color: '#9A9A92', textDecoration: 'none', letterSpacing: '.06em' }}>← Platform bookings</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '4px' }}>
              {block.platform?.toUpperCase()} · {PROPERTY_NAMES[block.property_id]}
            </div>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>
              {block.guest_name || 'Platform booking'}
            </h1>
            <div style={{ fontSize: '12px', color: '#9A9A92', marginTop: '4px' }}>
              {format(new Date(block.start_date), 'MMMM d')} → {format(new Date(block.end_date), 'MMMM d, yyyy')}
            </div>
          </div>
        </div>
      </div>
      <PlatformBookingForm block={block} />
    </div>
  )
}
