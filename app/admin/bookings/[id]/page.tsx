import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import Link from 'next/link'
import BookingActions from '@/components/admin/BookingActions'
import PaymentReminderForm from '@/components/admin/PaymentReminderForm'
import BookingEditForm from '@/components/admin/BookingEditForm'
import GuestEditCard from '@/components/admin/GuestEditCard'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East Suite',
  'royal-york-west': 'Royal York West Suite',
  'nickel-beach': 'Nickel Beach Retreat',
}

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Pending payment', color: '#f39c12' },
  confirmed:       { label: 'Confirmed',        color: '#2ecc71' },
  active:          { label: 'Active',           color: '#3498db' },
  completed:       { label: 'Completed',        color: '#AEAEA6' },
  cancelled:       { label: 'Cancelled',        color: '#e74c3c' },
}

function Row({ label, value, highlight }: { label: string; value: string | number | null; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid #363634' }}>
      <span style={{ fontSize: '12px', color: '#9A9A92', letterSpacing: '.04em' }}>{label}</span>
      <span style={{ fontSize: '13px', color: highlight ? 'var(--amber)' : '#F5F2EC', fontWeight: highlight ? 500 : 400 }}>{value ?? '—'}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', marginBottom: '16px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, guest_info:guests(name, email, phone, returning_guest, locked_rate_enabled)')
    .eq('id', id)
    .single()

  if (!booking) notFound()

  const guest = Array.isArray(booking.guest_info) ? (booking.guest_info as any[])[0] : booking.guest_info as any
  const status = STATUS_STYLES[booking.status]
  const plates = booking.plate_numbers as string[] || []

  return (
    <div>
      {/* header */}
      <div style={{ marginBottom: '28px' }}>
        <Link href="/admin/bookings" style={{ fontSize: '11px', color: '#9A9A92', textDecoration: 'none', letterSpacing: '.06em' }}>
          ← Bookings
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px' }}>
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>
              {guest?.name || 'Guest'}
            </div>
            <div style={{ fontSize: '12px', color: '#9A9A92', marginTop: '4px' }}>
              {PROPERTY_NAMES[booking.property_id]} · {format(new Date(booking.check_in), 'MMM d')} → {format(new Date(booking.check_out), 'MMM d, yyyy')}
            </div>
          </div>
          <span style={{ padding: '6px 14px', background: '#363634', color: status.color, fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase' }}>
            {status.label}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '16px', alignItems: 'start' }}>
        <div>
          {/* guest info */}
          <Section title="Guest">
            <GuestEditCard guestId={booking.guest_id} guest={guest} bookingId={booking.id} />
          </Section>

          <BookingEditForm booking={booking} />
        </div>

        {/* actions panel */}
        <div style={{ position: 'sticky', top: '32px' }}>
          <BookingActions booking={booking} />
      <PaymentReminderForm booking={booking} guest={guest} />
        </div>
      </div>
    </div>
  )
}
