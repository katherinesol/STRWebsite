'use client'
import { useState, useEffect } from 'react'

export default function WaterUsageCard({ propertyId, checkIn, checkOut }: { propertyId: string; checkIn: string; checkOut: string }) {
  const [stay, setStay] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/admin/cistern/usage?property=${propertyId}&checkIn=${checkIn}&checkOut=${checkOut}`)
      .then(r => r.json())
      .then(d => { if (d.stay) setStay(d.stay) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [propertyId, checkIn, checkOut])

  // only Nickel Beach has a cistern
  if (propertyId !== 'nickel-beach') return null
  if (loading) return null

  const hasData = stay && stay.readingCount >= 2

  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '18px 20px', marginBottom: '16px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '12px' }}>
        Water usage
      </div>
      {!hasData ? (
        <div style={{ fontSize: '12px', color: '#666660' }}>
          Not enough cistern readings for this stay yet. Usage tracking builds as readings accumulate.
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontFamily: 'var(--serif)', fontSize: '30px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>{stay.used}%</span>
            <span style={{ fontSize: '12px', color: '#9A9A92' }}>used over {stay.nights} night{stay.nights !== 1 ? 's' : ''}</span>
          </div>
          {stay.perNight != null && (
            <div style={{ fontSize: '12px', color: '#9A9A92' }}>~{stay.perNight}% per night</div>
          )}
          {stay.refillCount > 0 && (
            <div style={{ fontSize: '11px', color: '#3498db', marginTop: '6px' }}>
              {stay.refillCount} refill{stay.refillCount !== 1 ? 's' : ''} during stay (+{stay.refills}%)
            </div>
          )}
        </div>
      )}
    </div>
  )
}
