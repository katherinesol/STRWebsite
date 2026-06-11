import Link from 'next/link'
import BookingImportForm from '@/components/admin/BookingImportForm'

export default function ImportBookingsPage() {
  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/admin/bookings" style={{ fontSize: '11px', color: '#9A9A92', textDecoration: 'none' }}>← Bookings</Link>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F5F2EC', marginTop: '8px' }}>Import bookings.</h1>
        <div style={{ fontSize: '13px', color: '#9A9A92', marginTop: '4px' }}>
          Add historical bookings for complete revenue tracking. Each booking will be saved as completed.
        </div>
      </div>
      <BookingImportForm />
    </div>
  )
}
