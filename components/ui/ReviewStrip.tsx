'use client'
import { useState, useEffect } from 'react'

type Review = {
  id: string
  guest_name: string | null
  body: string | null
  platform: string
  property_id: string
  created_at: string
}

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East Suite',
  'royal-york-west': 'Royal York West Suite',
  'nickel-beach':    'Nickel Beach Retreat',
}

const PLATFORM_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  direct:  { label: 'Direct',  color: '#B8956B', bg: 'rgba(184,149,107,0.12)' },
  airbnb:  { label: 'Airbnb',  color: '#FF5A5F', bg: 'rgba(255,90,95,0.12)' },
  vrbo:    { label: 'VRBO',    color: '#3D6ECC', bg: 'rgba(61,110,204,0.12)' },
  houfy:   { label: 'Houfy',   color: '#2ECC71', bg: 'rgba(46,204,113,0.12)' },
}

// fallback reviews if DB is empty
const FALLBACK: Review[] = [
  { id: '1', guest_name: 'Direct guest', body: "Felt like staying at a friend's beautifully kept home — except everything was stocked, the location was perfect, and someone actually answered when I had a question.", platform: 'direct', property_id: 'royal-york-east', created_at: '2025-03-01' },
  { id: '2', guest_name: 'Airbnb guest', body: "Absolutely stunning space. Spotless, well-stocked, and the host was incredibly responsive. Will 100% be back.", platform: 'airbnb', property_id: 'royal-york-west', created_at: '2025-01-01' },
  { id: '3', guest_name: 'VRBO guest', body: "Nickel Beach was everything we hoped for — the hot tub was perfect after a day at the beach and the house had everything we needed for a group of 8.", platform: 'vrbo', property_id: 'nickel-beach', created_at: '2024-08-01' },
  { id: '4', guest_name: 'Airbnb guest', body: "Best Airbnb experience I've had in Toronto. The suite was immaculate, location was unbeatable, and check-in was seamless.", platform: 'airbnb', property_id: 'royal-york-east', created_at: '2024-11-01' },
  { id: '5', guest_name: 'Direct guest', body: "We booked direct and saved quite a bit. Communication was instant, the unit was pristine, and every detail had been thought of.", platform: 'direct', property_id: 'royal-york-west', created_at: '2025-02-01' },
  { id: '6', guest_name: 'Houfy guest', body: "Five stars without hesitation. The Nickel Beach house exceeded every expectation. Perfect for families and groups.", platform: 'houfy', property_id: 'nickel-beach', created_at: '2024-07-01' },
]

export default function ReviewStrip({ reviews = [] }: { reviews?: Review[] }) {
  const list = reviews.length >= 3 ? reviews : FALLBACK
  const [current, setCurrent] = useState(0)
  const [shuffled, setShuffled] = useState(list)

  useEffect(() => {
    setShuffled([...list].sort(() => Math.random() - 0.5))
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setCurrent(c => (c + 1) % shuffled.length), 6000)
    return () => clearInterval(timer)
  }, [shuffled.length])

  const r = shuffled[current]
  const platform = PLATFORM_STYLES[r?.platform] || PLATFORM_STYLES.direct

  return (
    <section id="reviews" style={{ background: 'var(--linen)', padding: 'clamp(48px,8vw,72px) clamp(20px,5vw,40px)', position: 'relative' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '20px' }}>
        Guest reviews · 5 stars across all platforms
      </div>

      <p style={{
        fontFamily: 'var(--serif)', fontSize: 'clamp(18px,3vw,32px)',
        fontWeight: 300, fontStyle: 'italic', color: 'var(--noir)',
        lineHeight: 1.5, maxWidth: '780px', marginBottom: '20px',
      }}>
        "{r?.body}"
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--amber)' }}>
          — {r?.guest_name} · {PROPERTY_NAMES[r?.property_id] || r?.property_id}
        </div>
        {/* platform badge — bottom right */}
        <div style={{
          fontSize: '9px', fontWeight: 500, letterSpacing: '.1em',
          textTransform: 'uppercase', padding: '4px 10px',
          background: platform.bg,
          color: platform.color,
          border: `0.5px solid ${platform.color}`,
          borderRadius: '2px',
        }}>
          {platform.label}
        </div>
      </div>

      {/* dots */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '28px' }}>
        {shuffled.map((_, i) => (
          <button key={i} onClick={() => setCurrent(i)} style={{
            width: i === current ? '20px' : '6px', height: '6px',
            borderRadius: '3px',
            background: i === current ? 'var(--noir)' : 'var(--sand-mid)',
            border: 'none', cursor: 'pointer', padding: 0,
            transition: 'width .3s, background .3s',
          }} />
        ))}
      </div>

      {/* platform legend — bottom right */}
      <div style={{ position: 'absolute', bottom: 'clamp(20px,4vw,40px)', right: 'clamp(20px,5vw,40px)', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {Object.entries(PLATFORM_STYLES).map(([key, style]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: style.color }} />
            <span style={{ fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{style.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
