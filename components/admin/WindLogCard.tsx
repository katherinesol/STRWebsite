'use client'
import { useState, useEffect } from 'react'
import { compass, AREA_FORECAST_CAVEAT } from '@/lib/hot-tub-wind'

const STATUS_COLOR: Record<string, string> = {
  CALM: '#7bc47b', WATCH: '#c9a24a', HIGH: '#e57373', UNKNOWN: '#9A9A92',
}

export default function WindLogCard({ propertyId, checkIn, checkOut, bookingId, bookingKind }: {
  propertyId: string; checkIn: string; checkOut: string; bookingId?: string; bookingKind?: 'direct' | 'platform'
}) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (propertyId !== 'nickel-beach') { setLoading(false); return }
    const q = new URLSearchParams({ property: propertyId, checkIn, checkOut })
    if (bookingId) { q.set('bookingId', bookingId); q.set('bookingKind', bookingKind || 'platform') }
    fetch(`/api/admin/wind/stay?${q}`)
      .then(r => r.json()).then(d => setData(d)).catch(() => {}).finally(() => setLoading(false))
  }, [propertyId, checkIn, checkOut, bookingId, bookingKind])

  // only Nickel Beach has the hot tub / Covana cover
  if (propertyId !== 'nickel-beach') return null
  if (loading) return null

  const s = data?.summary || {}
  const rows = data?.readings || []
  const shown = showAll ? rows : rows.slice(0, 12)

  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '18px 20px', marginBottom: '16px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '12px' }}>
        Wind during stay
      </div>

      {!rows.length ? (
        <div style={{ fontSize: '12px', color: '#666660' }}>
          No wind readings logged for these dates.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontFamily: 'var(--serif)', fontSize: '30px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>
              {Math.round(s.maxGust ?? 0)}
            </span>
            <span style={{ fontSize: '12px', color: '#9A9A92' }}>km/h peak gust</span>
          </div>
          <div style={{ fontSize: '12px', color: '#9A9A92', marginBottom: '10px' }}>
            max sustained {Math.round(s.maxSustained ?? 0)} · avg {s.avgSustained ?? '—'} km/h · {data.readingCount} readings
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: STATUS_COLOR.WATCH, background: '#2a2416', padding: '3px 9px', borderRadius: '3px' }}>
              {s.hoursWatch} in watch
            </span>
            <span style={{ fontSize: '11px', color: STATUS_COLOR.HIGH, background: '#2a1a1a', padding: '3px 9px', borderRadius: '3px' }}>
              {s.hoursHigh} in high
            </span>
            {data.linked && (
              <span style={{ fontSize: '11px', color: '#9A9A92', background: '#2A2A28', padding: '3px 9px', borderRadius: '3px' }}>
                linked stay · {data.range.start} → {data.range.end}
              </span>
            )}
          </div>

          <div style={{ borderTop: '0.5px solid #363634' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '150px 60px 60px 60px 1fr', padding: '7px 0', fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#666660' }}>
              <span>Time</span><span>Wind</span><span>Gust</span><span>Dir</span><span>Status</span>
            </div>
            {shown.map((r: any, i: number) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '150px 60px 60px 60px 1fr', padding: '6px 0', borderTop: '0.5px solid #2A2A28', fontSize: '11px', color: '#AEAEA6', alignItems: 'center' }}>
                <span>{new Date(r.recorded_at).toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                <span>{r.wind_speed != null ? Math.round(r.wind_speed) : '—'}</span>
                <span>{r.wind_gusts != null ? Math.round(r.wind_gusts) : '—'}</span>
                <span>{compass(r.wind_direction) || '—'}</span>
                <span>
                  <span style={{ color: STATUS_COLOR[r.status] || '#9A9A92' }}>{r.status}</span>
                  <span style={{ color: '#555550', marginLeft: '8px', fontSize: '10px' }}>{r.source}</span>
                </span>
              </div>
            ))}
            {rows.length > 12 && (
              <button onClick={() => setShowAll(v => !v)}
                style={{ marginTop: '8px', background: 'none', border: 'none', color: '#9A9A92', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', padding: 0 }}>
                {showAll ? '▾ Show fewer' : `▸ Show all ${rows.length} readings`}
              </button>
            )}
          </div>

          <p style={{ fontSize: '10px', color: '#8a8a82', fontStyle: 'italic', lineHeight: 1.45, margin: '10px 0 0' }}>{AREA_FORECAST_CAVEAT}</p>
        </>
      )}
    </div>
  )
}
