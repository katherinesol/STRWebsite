import { notFound } from 'next/navigation'
import BookingDetail from '@/components/keyholder/BookingDetail'
import { loadBookingDetail } from '@/lib/keyholder/booking-detail-data'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function DirectBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const d = await loadBookingDetail('direct', id)
  if (!d) notFound()
  // deleting condition photos is owner/co-owner; cleaners add but do not remove
  const canDeleteMedia = await hasRole('owner', 'co-owner')
  /*  Damage is its own permission area. Youlande is a co-owner with every area
      set to 'none'; the role alone would hand her the panel. Asked here so the
      control is not offered and then 403'd by the endpoint behind it. */
  const [canViewDamage, canEditDamage] = await Promise.all([
    hasPermission('damage', 'view'),
    hasPermission('damage', 'edit'),
  ])
  // the refund has to say which account the money left from
  const { data: accounts } = await createAdminClient()
    .from('bank_accounts').select('id, name, last4').eq('active', true).order('sort_order')
  return <BookingDetail kind="direct" canDeleteMedia={canDeleteMedia} canViewDamage={canViewDamage} canEditDamage={canEditDamage} siteUrl={process.env.NEXT_PUBLIC_SITE_URL || "https://rental-direct-five.vercel.app"} accounts={accounts || []} {...d} />
}
