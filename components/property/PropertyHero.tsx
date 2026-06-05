import { Property } from '@/lib/properties'

export default function PropertyHero({ property }: { property: Property }) {
  return (
    <div>
      {/* main hero image */}
      <div style={{
        width: '100%', height: '520px', background: 'var(--sand)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        <span style={{
          fontSize: '11px', letterSpacing: '.1em',
          textTransform: 'uppercase', color: 'var(--sand-mid)',
        }}>
          Hero photo — {property.name}
        </span>

        {/* overlay badge */}
        <div style={{
          position: 'absolute', bottom: '32px', left: '40px',
          background: 'rgba(250,250,248,.94)',
          border: '0.5px solid var(--sand)',
          padding: '16px 20px', backdropFilter: 'blur(8px)',
        }}>
          <div style={{
            fontSize: '10px', fontWeight: 500, letterSpacing: '.14em',
            textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '6px',
          }}>
            {property.neighbourhood} · {property.city}
          </div>
          <div style={{
            fontFamily: 'var(--serif)', fontSize: '24px',
            fontWeight: 300, color: 'var(--noir)', marginBottom: '4px',
          }}>
            {property.name}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
            {property.beds} bed · {property.baths} bath · Up to {property.guests} guests
          </div>
        </div>
      </div>

      {/* photo strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '2px', background: 'var(--sand)',
      }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{
            height: '180px', background: i % 2 === 0 ? '#D4D0C8' : '#E0DCD4',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              fontSize: '10px', letterSpacing: '.1em',
              textTransform: 'uppercase', color: 'var(--sand-mid)',
            }}>
              Photo {i + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
