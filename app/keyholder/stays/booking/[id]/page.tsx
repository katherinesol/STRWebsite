import { notFound } from 'next/navigation'
import BookingDetail from '@/components/keyholder/BookingDetail'
import { loadBookingDetail } from '@/lib/keyholder/booking-detail-data'

export const dynamic = 'force-dynamic'

export default async function DirectBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const d = await loadBookingDetail('direct', id)
  if (!d) notFound()
  return <BookingDetail kind="direct" {...d} />
}
