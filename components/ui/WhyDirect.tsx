const REASONS = [
  { num: '01', title: 'Lower price', body: 'No Airbnb or VRBO service fees passed on to you. What you see is what you pay.' },
  { num: '02', title: 'Priority booking', body: 'Book up to 12 months before your desired check-in date. Secure your stay before it goes live on other platforms.' },
  { num: '03', title: 'Flexible add-ons', body: 'Early check-in, late checkout, bag drop, Instacart delivery — handled personally.' },
  { num: '04', title: 'Guest portal', body: 'Your booking, access code, FAQ, and stay details in one place from confirmation to checkout.' },
]

export default function WhyDirect() {
  return (
    <section style={{ background: 'var(--noir)', padding: 'clamp(48px, 8vw, 80px) clamp(20px, 5vw, 40px)' }}>
      <div style={{
        fontSize: '10px', fontWeight: 500, letterSpacing: '.16em',
        textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '12px',
      }}>
        Why book direct
      </div>
      <h2 style={{
        fontFamily: 'var(--serif)', fontSize: 'clamp(30px, 4vw, 44px)',
        fontWeight: 300, color: '#F0EDE6', marginBottom: '48px', lineHeight: 1.1,
      }}>
        <em>No fees. No surprises.</em>
      </h2>
      <style>{`@media (max-width: 768px) { .why-grid { grid-template-columns: 1fr 1fr !important; } } @media (max-width: 480px) { .why-grid { grid-template-columns: 1fr !important; } }`}</style>
      <div className="why-grid" style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1px', background: '#2A2A28',
        borderTop: '0.5px solid #2A2A28',
      }}>
        {REASONS.map(r => (
          <div key={r.num} style={{ background: 'var(--noir)', padding: '32px 28px' }}>
            <div style={{
              fontFamily: 'var(--serif)', fontSize: '36px', fontWeight: 300,
              fontStyle: 'italic', color: 'var(--amber)', marginBottom: '12px', opacity: .7,
            }}>
              {r.num}
            </div>
            <div style={{
              fontSize: '12px', fontWeight: 500, letterSpacing: '.08em',
              textTransform: 'uppercase', color: '#F0EDE6', marginBottom: '8px',
            }}>
              {r.title}
            </div>
            <div style={{ fontSize: '13px', color: '#666660', lineHeight: 1.6 }}>
              {r.body}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
