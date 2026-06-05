'use client'
import { useState, useEffect } from 'react'

// Reviews pulled from all platforms — rotated randomly on each load.
// Source field reflects platform origin. In production these will be
// fetched from the admin-managed review store (imported from Airbnb,
// VRBO, Houfy, or submitted directly).
const REVIEWS = [
  {
    text: "Felt like staying at a friend's beautifully kept home — except everything was stocked, the location was perfect, and someone actually answered when I had a question.",
    guest: 'Direct guest',
    property: 'Royal York East Suite',
    date: 'March 2025',
    source: 'Direct',
    stars: 5,
  },
  {
    text: "Absolutely stunning space. Spotless, well-stocked, and the host was incredibly responsive. Will 100% be back.",
    guest: 'Airbnb guest',
    property: 'Royal York West Suite',
    date: 'January 2025',
    source: 'Airbnb',
    stars: 5,
  },
  {
    text: "Nickel Beach was everything we hoped for — the hot tub was perfect after a day at the beach and the house had everything we needed for a group of 8.",
    guest: 'VRBO guest',
    property: 'Nickel Beach Retreat',
    date: 'August 2024',
    source: 'VRBO',
    stars: 5,
  },
  {
    text: "Best Airbnb experience I've had in Toronto. The suite was immaculate, location was unbeatable, and check-in was seamless.",
    guest: 'Airbnb guest',
    property: 'Royal York East Suite',
    date: 'November 2024',
    source: 'Airbnb',
    stars: 5,
  },
  {
    text: "We booked direct and saved quite a bit. Communication was instant, the unit was pristine, and every detail had been thought of.",
    guest: 'Direct guest',
    property: 'Royal York West Suite',
    date: 'February 2025',
    source: 'Direct',
    stars: 5,
  },
  {
    text: "Five stars without hesitation. The Nickel Beach house exceeded every expectation. Perfect for families and groups.",
    guest: 'Houfy guest',
    property: 'Nickel Beach Retreat',
    date: 'July 2024',
    source: 'Houfy',
    stars: 5,
  },
]

const SOURCE_COLORS: Record<string, string> = {
  Direct:  '#B8956B',
  Airbnb:  '#FF5A5F',
  VRBO:    '#3D6ECC',
  Houfy:   '#2ECC71',
}

export default function ReviewStrip() {
  const [current, setCurrent] = useState(0)
  const [reviews, setReviews] = useState(REVIEWS)

  // shuffle on mount for random order
  useEffect(() => {
    const shuffled = [...REVIEWS].sort(() => Math.random() - 0.5)
    setReviews(shuffled)
  }, [])

  // auto-advance every 6 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent(c => (c + 1) % reviews.length)
    }, 6000)
    return () => clearInterval(timer)
  }, [reviews.length])

  const r = reviews[current]

  return (
    <section id="reviews" style={{ background: 'var(--linen)', padding: 'clamp(48px, 8vw, 72px) clamp(20px, 5vw, 40px)' }}>
      <div style={{
        fontSize: '10px', fontWeight: 500, letterSpacing: '.16em',
        textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '20px',
      }}>
        Guest reviews · 5 stars across all platforms
      </div>

      <p style={{
        fontFamily: 'var(--serif)', fontSize: 'clamp(22px, 3vw, 32px)',
        fontWeight: 300, fontStyle: 'italic', color: 'var(--noir)',
        lineHeight: 1.5, maxWidth: '780px', marginBottom: '20px',
        transition: 'opacity .3s',
      }}>
        "{r.text}"
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{
          fontSize: '11px', fontWeight: 500, letterSpacing: '.1em',
          textTransform: 'uppercase', color: 'var(--amber)',
        }}>
          — {r.guest} · {r.property} · {r.date}
        </div>
        <div style={{
          fontSize: '9px', fontWeight: 500, letterSpacing: '.1em',
          textTransform: 'uppercase', padding: '3px 8px',
          background: SOURCE_COLORS[r.source] || 'var(--amber)',
          color: '#fff', borderRadius: '2px',
        }}>
          {r.source}
        </div>
      </div>

      {/* dots */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '28px' }}>
        {reviews.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            style={{
              width: i === current ? '20px' : '6px',
              height: '6px', borderRadius: '3px',
              background: i === current ? 'var(--noir)' : 'var(--sand-mid)',
              border: 'none', cursor: 'pointer', padding: 0,
              transition: 'width .3s, background .3s',
            }}
          />
        ))}
      </div>
    </section>
  )
}
