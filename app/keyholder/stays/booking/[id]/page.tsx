import { notFound } from 'next/navigation'
import BookingDetail from '@/components/keyholder/BookingDetail'
import { loadBookingDetail } from '@/lib/keyholder/booking-detail-data'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function DirectBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const d = await loadBookingDetail('direct', id)
  if (!d) notFound()
  // the refund has to say which account the money left from
  const { data: accounts } = await createAdminClient()
    .from('bank_accounts').select('id, name, last4').eq('active', true).order('sort_order')
  return <BookingDetail kind="direct" siteUrl={process.env.NEXT_PUBLIC_SITE_URL || "https://rental-direct-five.vercel.app"} accounts={accounts || []} {...d} />
}
