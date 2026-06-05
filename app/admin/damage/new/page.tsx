import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import DamageReportForm from '@/components/admin/DamageReportForm'

export default async function NewDamageReportPage() {
  const supabase = createAdminClient()
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, property_id, check_in, check_out, guests(name)')
    .in('status', ['active', 'completed'])
    .order('check_in', { ascending: false })
    .limit(50)

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/admin/damage" style={{ fontSize: '11px', color: '#9A9A92', textDecoration: 'none', letterSpacing: '.06em' }}>← Damage reports</Link>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1, marginTop: '12px' }}>New report.</h1>
      </div>
      <DamageReportForm bookings={bookings || []} />
    </div>
  )
}
