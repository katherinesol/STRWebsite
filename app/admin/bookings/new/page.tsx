import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import ManualBookingForm from '@/components/admin/ManualBookingForm'

export default async function NewBookingPage() {
  const supabase = createAdminClient()
  const { data: guests } = await supabase
    .from('guests')
    .select('id, name, email')
    .order('name')

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/admin/bookings" style={{ fontSize: '11px', color: '#9A9A92', textDecoration: 'none', letterSpacing: '.06em' }}>← Bookings</Link>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1, marginTop: '12px' }}>Manual booking.</h1>
      </div>
      <ManualBookingForm guests={guests || []} />
    </div>
  )
}
