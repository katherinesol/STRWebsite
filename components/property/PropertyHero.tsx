import { Property } from '@/lib/properties'

type Photo = { id: string; url: string; media_type: string; is_cover: boolean }

export default function PropertyHero({ property, photos = [] }: { property: Property; photos?: Photo[] }) {
  const images = photos.filter(p => p.media_type === 'image')
  const cover = images.find(p => p.is_cover) || images[0] || null
  const strip = images.filter(p => p.id !== cover?.id).slice(0, 4)

  return (
    <div>
      {/* main hero image */}
      <div style={{
        width: '100%', height: 'clamp(320px, 50vh, 520px)', background: 'var(--sand)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        {cover ? (
          <img src={cover.url} alt={property.name} fetchPriority="high"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--sand-mid)' }}>
            Hero photo — {property.name}
          </span>
        )}
        {/* overlay badge */}
        <div style={{
          position: 'absolute', bottom: 'clamp(16px, 4vw, 32px)', left: 'clamp(16px, 4vw, 40px)',
          background: 'rgba(250,250,248,.94)',
          border: '0.5px solid var(--sand)',
          padding: '16px 20px', backdropFilter: 'blur(8px)',
          maxWidth: 'calc(100% - 32px)',
        }}>
          <div style={{
            fontSize: '10px', fontWeight: 500, letterSpacing: '.14em',
            textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '6px',
          }}>
            {property.neighbourhood} · {property.city}
          </div>
          <div style={{
            fontFamily: 'var(--serif)', fontSize: 'clamp(20px, 4vw, 24px)',
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
      {strip.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(${Math.min(strip.length, 4)}, 1fr)`,
          gap: '2px', background: 'var(--sand)',
        }}>
          {strip.map(p => (
            <div key={p.id} style={{ aspectRatio: '4/3', maxHeight: '180px', overflow: 'hidden' }}>
              <img src={p.url} alt="" loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
