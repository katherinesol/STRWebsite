import Link from 'next/link'
import { L, F, cardStyle } from '@/lib/design-tokens'

export default function StaysIndex() {
  return (
    <div style={{ paddingTop: '24px', display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '640px' }}>
      <span style={{ fontFamily: F.serif, fontSize: '36px', lineHeight: 1 }}>Stays</span>
      <Link href="/keyholder/stays/calendar" style={{ ...cardStyle, padding: '20px 22px', textDecoration: 'none', display: 'block' }}>
        <span style={{ fontSize: '16px', fontWeight: 600, color: L.ink }}>Calendar →</span>
        <span style={{ display: 'block', fontSize: '13px', color: L.inkBody, marginTop: '4px' }}>
          Arrivals, departures and turnovers across all three properties.
        </span>
      </Link>
      <p style={{ fontSize: '14px', color: L.inkBody, lineHeight: 1.55 }}>
        Bookings, guests and parking are still on the{' '}
        <a href="/admin/bookings" style={{ color: L.link, fontWeight: 600 }}>legacy admin</a>.
      </p>
    </div>
  )
}
