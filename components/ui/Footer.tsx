import Link from 'next/link'

export default function Footer({ brandName = '[Your Brand]' }: { brandName?: string }) {
  return (
    <footer style={{ background: 'var(--noir)', padding: '56px 40px 32px' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
        gap: '40px', marginBottom: '48px', paddingBottom: '48px',
        borderBottom: '0.5px solid #2A2A28',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--serif)', fontSize: '24px', fontStyle: 'italic',
            fontWeight: 300, color: '#F0EDE6', marginBottom: '12px',
          }}>
            {brandName}<span style={{ color: 'var(--amber)' }}>.</span>
          </div>
          <p style={{ fontSize: '13px', color: '#555550', lineHeight: 1.6 }}>
            Thoughtfully designed. Fully stocked.<br />Well situated. A true home away from home.
          </p>
        </div>
        {[
          {
            label: 'Properties',
            links: [
              { href: '/property/royal-york-east', label: 'Royal York East Suite' },
              { href: '/property/royal-york-west', label: 'Royal York West Suite' },
              { href: '/property/nickel-beach', label: 'Nickel Beach Retreat' },
            ],
          },
          {
            label: 'Host',
            links: [
              { href: '/about', label: 'About' },
              { href: '#guide', label: 'Local Guide' },
              { href: '#reviews', label: 'Guest Reviews' },
              { href: '/contact', label: 'Contact' },
            ],
          },
          {
            label: 'Booking',
            links: [
              { href: '#how', label: 'How it works' },
              { href: '/faq', label: 'FAQ' },
              { href: '/cancellation', label: 'Cancellation policy' },
              { href: '/privacy', label: 'Privacy policy' },
            ],
          },
        ].map(col => (
          <div key={col.label}>
            <div style={{
              fontSize: '10px', fontWeight: 500, letterSpacing: '.12em',
              textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px',
            }}>
              {col.label}
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {col.links.map(l => (
                <li key={l.href}>
                  <Link href={l.href} style={{ fontSize: '13px', color: '#555550' }}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '10px', color: '#333330', letterSpacing: '.08em' }}>
          {'Site by '}<a href="#" style={{ color: '#444440', borderBottom: '0.5px solid #444440', paddingBottom: '1px' }}>yourdomain.com</a>
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: '#444440' }}>
          © 2025 {brandName}. All rights reserved.
        </span>
        <div style={{ display: 'flex', gap: '24px' }}>
          {['Terms', 'Privacy', 'Accessibility'].map(l => (
            <Link key={l} href={`/${l.toLowerCase()}`} style={{ fontSize: '11px', color: '#444440' }}>
              {l}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  )
}
