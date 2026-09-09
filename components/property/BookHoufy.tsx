import type { Property } from '@/lib/properties'

/*  THE BOOK CTA. Booking happens on HOUFY, not here.
 *
 *  This replaces BookingWidget, which sent guests to an on-site checkout that
 *  could not take a payment: the card path rendered a placeholder and the API
 *  marked the booking CONFIRMED anyway. That whole surface is deleted rather
 *  than repaired — see docs/design/BACKLOG.md.
 *
 *  Houfy is not a fallback. It takes NO host commission, so unlike Airbnb's
 *  15.5% there is no platform cut between the guest and the property, and the
 *  guest pays no service fee on top. That is a better deal for both sides than
 *  the on-site flow would have been, and it works today.
 *
 *  A PROPERTY WITHOUT A LISTING SAYS SO. Royal York East has no Houfy listing,
 *  no bookings, no calendar feeds and no photos. It gets an explicit
 *  not-accepting-bookings state, never a button that goes nowhere. */

export default function BookHoufy({ property, nightly }: { property: Property; nightly?: number | null }) {
  const rate = nightly ?? property.nightly

  if (!property.houfyUrl) {
    return (
      <div style={{ border: '0.5px solid var(--sand)', background: 'var(--linen)', padding: '28px 24px' }}>
        <div style={{ fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '14px' }}>
          Not currently available
        </div>
        <div style={{ fontFamily: 'var(--serif)', fontSize: '22px', fontWeight: 300, color: 'var(--noir)', lineHeight: 1.3, marginBottom: '12px' }}>
          This suite isn&apos;t accepting bookings
        </div>
        <div style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--muted)' }}>
          We&apos;re not taking reservations here at the moment. Our other homes are
          available — a bright suite by Royal York station and a waterfront cottage
          in Port Colborne.
        </div>
      </div>
    )
  }

  return (
    <div style={{ border: '0.5px solid var(--sand)', background: 'var(--linen)', padding: '28px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontFamily: 'var(--serif)', fontSize: '30px', fontWeight: 300, color: 'var(--noir)' }}>${rate}</span>
        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>per night</span>
      </div>
      <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '22px' }}>
        {property.minStay} night minimum · {property.checkIn} check-in · {property.checkOut} check-out
      </div>

      <a href={property.houfyUrl} target="_blank" rel="noopener noreferrer"
        style={{
          display: 'block', width: '100%', padding: '15px', background: 'var(--noir)', color: 'var(--chalk)',
          fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase',
          textAlign: 'center', borderRadius: '2px',
        }}>
        Book on Houfy
      </a>

      <div style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'center', marginTop: '12px', lineHeight: 1.6 }}>
        No guest service fee · dates and availability on Houfy
      </div>
    </div>
  )
}
