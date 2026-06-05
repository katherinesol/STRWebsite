'use client'

const PROPERTIES = [
  {
    id: 'royal-york-east',
    neighbourhood: 'Mimico · Toronto',
    name: 'Royal York\nEast Suite',
    detail: '2 bed · 1 bath · Up to 4 guests\nLake views · Keyless entry',
    from: 180,
    bg: '#E0DCD4',
  },
  {
    id: 'royal-york-west',
    neighbourhood: 'Mimico · Toronto',
    name: 'Royal York\nWest Suite',
    detail: '2 bed · 1 bath · Up to 4 guests\nLake views · Keyless entry',
    from: 180,
    bg: '#D4D0C8',
  },
  {
    id: 'nickel-beach',
    neighbourhood: 'Port Colborne · Niagara',
    name: 'Nickel Beach\nRetreat',
    detail: '4 bed · 2 bath · Up to 10 guests\nBeach access · Hot tub & sauna',
    from: 320,
    bg: '#C8C4BC',
  },
]

export default function Properties() {
  return (
    <section id="properties" style={{ background: 'var(--chalk)', padding: 'clamp(48px, 8vw, 80px) clamp(20px, 5vw, 40px) 0' }}>
      <div style={{
        fontSize: '10px', fontWeight: 500, letterSpacing: '.16em',
        textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '12px',
      }}>
        Our properties
      </div>
      <h2 style={{
        fontFamily: 'var(--serif)', fontSize: 'clamp(30px, 4vw, 44px)',
        fontWeight: 300, letterSpacing: '-.01em', color: 'var(--noir)', marginBottom: '10px',
      }}>
        Stay with <em>us.</em>
      </h2>
      <p style={{
        fontSize: '14px', color: 'var(--muted)', lineHeight: 1.7,
        maxWidth: '520px', marginBottom: '40px',
      }}>
        Thoughtfully designed. Fully stocked. Well situated. A true home away from home.
      </p>

      {/* property grid */}
      <style>{`
        @media (max-width: 768px) { .prop-grid { grid-template-columns: 1fr !important; } }
        @media (max-width: 1024px) and (min-width: 769px) { .prop-grid { grid-template-columns: 1fr 1fr !important; } }
      `}</style>
      <div className="prop-grid" style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        gap: '1px', background: 'var(--sand)', marginTop: '1px',
      }}>
        {PROPERTIES.map(p => (
          <div key={p.id} style={{ background: 'var(--chalk)', cursor: 'pointer' }}>
            <div style={{
              width: '100%', aspectRatio: '3/2', background: p.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontSize: '10px', letterSpacing: '.1em',
                textTransform: 'uppercase', color: 'var(--sand-mid)',
              }}>
                Property photo
              </span>
            </div>
            <div style={{ padding: '20px 22px 24px' }}>
              <div style={{
                fontSize: '10px', fontWeight: 500, letterSpacing: '.12em',
                textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '6px',
              }}>
                {p.neighbourhood}
              </div>
              <div style={{
                fontFamily: 'var(--serif)', fontSize: '20px',
                fontWeight: 300, color: 'var(--noir)', marginBottom: '4px',
                lineHeight: 1.2, whiteSpace: 'pre-line',
              }}>
                {p.name}
              </div>
              <div style={{
                fontSize: '12px', color: 'var(--muted)',
                marginBottom: '14px', lineHeight: 1.6, whiteSpace: 'pre-line',
              }}>
                {p.detail}
              </div>
              <a href={`/property/${p.id}`} style={{
                fontSize: '11px', letterSpacing: '.06em', color: 'var(--noir)',
                borderBottom: '0.5px solid var(--noir)', paddingBottom: '1px',
              }}>
                Explore →
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* group note */}
      <div style={{
        background: 'var(--linen)', borderTop: '0.5px solid var(--sand)',
        padding: '18px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: 'var(--amber)', flexShrink: 0, display: 'block',
          }} />
          <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--noir)', fontWeight: 500 }}>Hosting a group?</strong>{' '}
            Royal York East and West are in the same building — book both and your whole crew stays together. Up to 8 guests across both suites.
          </p>
        </div>
        <a href="/booking?group=royal-york" style={{
          fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase',
          padding: '10px 20px', background: 'var(--noir)', color: 'var(--chalk)',
          borderRadius: '2px', whiteSpace: 'nowrap',
        }}>
          Book both suites →
        </a>
      </div>
    </section>
  )
}
