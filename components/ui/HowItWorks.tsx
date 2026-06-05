const STEPS = [
  { step: 'Step 01', title: 'Choose your property', body: 'Browse the three properties. Check availability, read what\'s included, and pick your dates.' },
  { step: 'Step 02', title: 'Reserve your dates', body: 'A 10% reservation fee is due at booking to secure your dates.' },
  { step: 'Step 03', title: 'Confirm & pay', body: '50% due 60 days before check-in, the remainder 30 days out. Pay by card or e-transfer.' },
  { step: 'Step 04', title: 'Arrive & enjoy', body: 'Your access code, local guide, and everything you need is waiting in your guest portal.' },
]

export default function HowItWorks() {
  return (
    <section id="how" style={{ background: 'var(--chalk)', padding: 'clamp(48px, 8vw, 80px) clamp(20px, 5vw, 40px)' }}>
      <div style={{
        fontSize: '10px', fontWeight: 500, letterSpacing: '.16em',
        textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '12px',
      }}>
        How it works
      </div>
      <h2 style={{
        fontFamily: 'var(--serif)', fontSize: 'clamp(30px, 4vw, 44px)',
        fontWeight: 300, color: 'var(--noir)', marginBottom: '40px',
      }}>
        Book in <em>four steps.</em>
      </h2>
      <style>{`@media (max-width: 768px) { .how-grid { grid-template-columns: 1fr 1fr !important; } } @media (max-width: 480px) { .how-grid { grid-template-columns: 1fr !important; } }`}</style>
      <div className="how-grid" style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1px', background: 'var(--sand)',
        border: '0.5px solid var(--sand)',
      }}>
        {STEPS.map(s => (
          <div key={s.step} style={{ background: 'var(--chalk)', padding: '32px 28px' }}>
            <div style={{
              fontSize: '10px', fontWeight: 500, letterSpacing: '.12em',
              textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '12px',
            }}>
              {s.step}
            </div>
            <div style={{
              fontFamily: 'var(--serif)', fontSize: '18px',
              fontWeight: 300, color: 'var(--noir)', marginBottom: '8px',
            }}>
              {s.title}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6 }}>
              {s.body}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
