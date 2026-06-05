import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import Link from 'next/link'
import BookingActions from '@/components/admin/BookingActions'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East Suite',
  'royal-york-west': 'Royal York West Suite',
  'nickel-beach': 'Nickel Beach Retreat',
}

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Pending payment', color: '#f39c12' },
  confirmed:       { label: 'Confirmed',        color: '#2ecc71' },
  active:          { label: 'Active',           color: '#3498db' },
  completed:       { label: 'Completed',        color: '#666660' },
  cancelled:       { label: 'Cancelled',        color: '#e74c3c' },
}

function Row({ label, value, highlight }: { label: string; value: string | number | null; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid #2A2A28' }}>
      <span style={{ fontSize: '12px', color: '#555550', letterSpacing: '.04em' }}>{label}</span>
      <span style={{ fontSize: '13px', color: highlight ? 'var(--amber)' : '#F0EDE6', fontWeight: highlight ? 500 : 400 }}>{value ?? '—'}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#1A1A18', border: '0.5px solid #2A2A28', padding: '24px', marginBottom: '16px' }}>
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
    .select('*, guests(name, email, phone, returning_guest, locked_rate_enabled)')
    .eq('id', id)
    .single()

  if (!booking) notFound()

  const guest = booking.guests as any
  const status = STATUS_STYLES[booking.status]
  const plates = booking.plate_numbers as string[] || []

  return (
    <div>
      {/* header */}
      <div style={{ marginBottom: '28px' }}>
        <Link href="/admin/bookings" style={{ fontSize: '11px', color: '#555550', textDecoration: 'none', letterSpacing: '.06em' }}>
          ← Bookings
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px' }}>
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F0EDE6', lineHeight: 1 }}>
              {guest?.name || 'Guest'}
            </div>
            <div style={{ fontSize: '12px', color: '#555550', marginTop: '4px' }}>
              {PROPERTY_NAMES[booking.property_id]} · {format(new Date(booking.check_in), 'MMM d')} → {format(new Date(booking.check_out), 'MMM d, yyyy')}
            </div>
          </div>
          <span style={{ padding: '6px 14px', background: '#2A2A28', color: status.color, fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase' }}>
            {status.label}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '16px', alignItems: 'start' }}>
        <div>
          {/* guest info */}
          <Section title="Guest">
            <Row label="Name" value={guest?.name} />
            <Row label="Email" value={guest?.email} />
            <Row label="Phone" value={guest?.phone} />
            <Row label="Returning guest" value={guest?.returning_guest ? 'Yes' : 'No'} />
            <Row label="Locked rate" value={guest?.locked_rate_enabled ? 'Yes' : 'No'} />
          </Section>

          {/* stay details */}
          <Section title="Stay">
            <Row label="Property" value={PROPERTY_NAMES[booking.property_id]} />
            <Row label="Check-in" value={format(new Date(booking.check_in), 'EEEE, MMMM d yyyy')} />
            <Row label="Check-out" value={format(new Date(booking.check_out), 'EEEE, MMMM d yyyy')} />
            <Row label="Nights" value={booking.nights} />
            <Row label="Guests" value={booking.guests} />
            <Row label="Early check-in" value={booking.early_checkin ? `Yes — ${booking.early_checkin_time}` : 'No'} />
            <Row label="Late checkout" value={booking.late_checkout ? `Yes — ${booking.late_checkout_time}` : 'No'} />
            <Row label="Bag drop" value={booking.bag_drop !== 'none' ? booking.bag_drop : 'No'} />
            <Row label="Instacart" value={booking.instacart_requested ? 'Requested' : 'No'} />
          </Section>

          {/* vehicles */}
          <Section title="Parking & vehicles">
            <Row label="Vehicles" value={booking.vehicle_count} />
            <Row label="Plates pending" value={booking.plates_pending ? 'Yes — reminder to be sent' : 'No'} highlight={booking.plates_pending} />
            {plates.filter(Boolean).map((plate, i) => (
              <Row key={i} label={`Plate ${i + 1}`} value={plate} />
            ))}
          </Section>

          {/* payment */}
          <Section title="Payment">
            <Row label="Method" value={booking.payment_method === 'etransfer' ? 'E-transfer' : 'Card'} />
            <Row label="Accommodation" value={`$${booking.accommodation}`} />
            <Row label="Cleaning fee" value={`$${booking.cleaning_fee}`} />
            <Row label="HST" value={`$${booking.hst}`} />
            <Row label="MAT" value={`$${booking.mat}`} />
            {booking.addon_fee > 0 && <Row label="Add-ons" value={`$${booking.addon_fee}`} />}
            <Row label="Total" value={`$${booking.total}`} highlight />
            <Row label="Deposit" value={`$${booking.deposit_amount}`} />
            <Row label="Deposit paid" value={booking.deposit_paid_at ? format(new Date(booking.deposit_paid_at), 'MMM d, yyyy') : 'Not yet'} highlight={!booking.deposit_paid_at} />
            <Row label="2nd payment" value={`$${booking.second_payment_amount} due ${booking.second_due_date ? format(new Date(booking.second_due_date), 'MMM d, yyyy') : '—'}`} />
            <Row label="2nd paid" value={booking.second_paid_at ? format(new Date(booking.second_paid_at), 'MMM d, yyyy') : 'Not yet'} highlight={!booking.second_paid_at} />
            <Row label="Final payment" value={`$${booking.final_payment_amount} due ${booking.final_due_date ? format(new Date(booking.final_due_date), 'MMM d, yyyy') : '—'}`} />
            <Row label="Final paid" value={booking.final_paid_at ? format(new Date(booking.final_paid_at), 'MMM d, yyyy') : 'Not yet'} highlight={!booking.final_paid_at} />
            <Row label="Security deposit" value={booking.security_deposit_status} />
          </Section>
        </div>

        {/* actions panel */}
        <div style={{ position: 'sticky', top: '32px' }}>
          <BookingActions booking={booking} />
        </div>
      </div>
    </div>
  )
}
