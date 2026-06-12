'use client'

export default function StickyBookingCTA({ propertyName, fromPrice }: { propertyName: string; fromPrice?: number | null }) {
  return (
    <div className="sticky-cta">
      <div>
        <div style={{ fontSize: '12px', color: '#F5F2EC', fontWeight: 500 }}>{propertyName}</div>
        {fromPrice ? (
          <div style={{ fontSize: '11px', color: '#9A9A92' }}>From ${fromPrice}/night</div>
        ) : null}
      </div>
      <button
        onClick={() => document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        style={{
          padding: '13px 22px', minHeight: 'var(--tap-target)',
          background: 'var(--amber)', color: '#1A1A18', border: 'none',
          fontFamily: 'var(--sans)', fontSize: '12px', letterSpacing: '.1em',
          textTransform: 'uppercase', fontWeight: 500, cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}>
        Check availability
      </button>
    </div>
  )
}
