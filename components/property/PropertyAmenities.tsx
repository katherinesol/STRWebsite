import { Property } from '@/lib/properties'

export default function PropertyAmenities({ property }: { property: Property }) {
  return (
    <div style={{
      borderTop: '0.5px solid var(--sand)',
      paddingTop: '40px', marginBottom: '48px',
    }}>
      <div style={{
        fontSize: '10px', fontWeight: 500, letterSpacing: '.16em',
        textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '8px',
      }}>
        Amenities
      </div>
      <h2 style={{
        fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300,
        color: 'var(--noir)', marginBottom: '24px',
      }}>
        What&apos;s included.
      </h2>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '12px',
      }}>
        {property.amenities.map(a => (
          <div key={a} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <span style={{
              width: '16px', height: '16px', borderRadius: '50%',
              border: '0.5px solid var(--sand-mid)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, fontSize: '9px', color: 'var(--amber)',
            }}>
              ✓
            </span>
            <span style={{ fontSize: '13px', color: 'var(--noir)' }}>{a}</span>
          </div>
        ))}
      </div>

      {/* house rules */}
      <div style={{ marginTop: '36px' }}>
        <div style={{
          fontSize: '10px', fontWeight: 500, letterSpacing: '.14em',
          textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '14px',
        }}>
          House rules
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {property.houseRules.map(r => (
            <div key={r} style={{
              fontSize: '13px', color: 'var(--muted)',
              padding: '8px 0', borderBottom: '0.5px solid var(--sand)',
            }}>
              {r}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
