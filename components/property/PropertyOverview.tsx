import { Property } from '@/lib/properties'

export default function PropertyOverview({ property }: { property: Property }) {
  return (
    <div style={{ marginBottom: '48px' }}>
      <div style={{
        fontSize: '10px', fontWeight: 500, letterSpacing: '.16em',
        textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '12px',
      }}>
        {property.neighbourhood} · {property.city}
      </div>
      <h1 style={{
        fontFamily: 'var(--serif)', fontSize: 'clamp(32px, 4vw, 48px)',
        fontWeight: 300, color: 'var(--noir)', marginBottom: '8px', lineHeight: 1.05,
      }}>
        {property.name}
      </h1>
      <p style={{
        fontFamily: 'var(--serif)', fontSize: '18px', fontStyle: 'italic',
        fontWeight: 300, color: 'var(--muted)', marginBottom: '28px',
      }}>
        {property.tagline}
      </p>

      {/* key stats */}
      <div style={{
        display: 'flex', gap: '0', borderTop: '0.5px solid var(--sand)',
        borderBottom: '0.5px solid var(--sand)', marginBottom: '32px',
      }}>
        {[
          { label: 'Bedrooms', value: property.beds },
          { label: 'Bathrooms', value: property.baths },
          { label: 'Max guests', value: property.guests },
          { label: 'Min stay', value: `${property.minStay} nights` },
        ].map(({ label, value }) => (
          <div key={label} style={{
            flex: 1, padding: '20px 0',
            borderRight: '0.5px solid var(--sand)',
            textAlign: 'center',
          }}>
            <div style={{
              fontFamily: 'var(--serif)', fontSize: '28px',
              fontWeight: 300, color: 'var(--noir)', marginBottom: '4px',
            }}>
              {value}
            </div>
            <div style={{
              fontSize: '10px', fontWeight: 500, letterSpacing: '.12em',
              textTransform: 'uppercase', color: 'var(--muted)',
            }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* description */}
      <p style={{
        fontSize: '15px', color: 'var(--noir)', lineHeight: 1.8,
        marginBottom: '20px',
      }}>
        {property.description}
      </p>
      <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.75 }}>
        {property.areaDescription}
      </p>

      {/* highlights */}
      <div style={{ marginTop: '28px' }}>
        <div style={{
          fontSize: '10px', fontWeight: 500, letterSpacing: '.14em',
          textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '14px',
        }}>
          Highlights
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {property.highlights.map(h => (
            <div key={h} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                width: '5px', height: '5px', borderRadius: '50%',
                background: 'var(--amber)', flexShrink: 0, display: 'block',
              }} />
              <span style={{ fontSize: '14px', color: 'var(--noir)' }}>{h}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
