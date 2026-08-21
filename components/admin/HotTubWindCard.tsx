'use client'
import { useState, useEffect } from 'react'
import { compass, AREA_FORECAST_CAVEAT, WIND_CALM_MAX_KMH, WIND_HIGH_MIN_KMH } from '@/lib/hot-tub-wind'

const STATE_STYLE: Record<string, { bg: string; color: string }> = {
  CALM:    { bg: '#16281a', color: '#7bc47b' },
  WATCH:   { bg: '#2a2416', color: '#c9a24a' },
  HIGH:    { bg: '#2a1a1a', color: '#e57373' },
  UNKNOWN: { bg: '#242422', color: '#9A9A92' },
}

export default function HotTubWindCard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/nickel-wind')
      .then(r => r.json()).then(d => setData(d)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const st = STATE_STYLE[data?.status] || STATE_STYLE.UNKNOWN
  const d = data?.detail || {}
  const dir = compass(d.directionDeg ?? null)

  return (
    <div style={{ background: '#1E1E1C', border: '0.5px solid #363634', borderRadius: '10px', padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', color: '#F0EDE6', fontWeight: 500 }}>Nickel Beach · Hot tub wind</span>
        <span style={{ fontSize: '10px', color: '#666660' }}>watch {WIND_CALM_MAX_KMH} · high {WIND_HIGH_MIN_KMH} km/h</span>
      </div>

      {loading ? <div style={{ fontSize: '12px', color: '#666660' }}>Checking wind…</div> : (
        <>
          <div style={{ display: 'inline-block', background: st.bg, color: st.color, padding: '6px 14px', borderRadius: '6px', fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>
            {data?.label || 'Unknown'}
          </div>
          <p style={{ fontSize: '12px', color: '#B8B8B0', lineHeight: 1.5, margin: '0 0 10px' }}>{data?.reason}</p>
          <div style={{ display: 'flex', gap: '14px', fontSize: '10px', color: '#777770', flexWrap: 'wrap' }}>
            {d.windKmh != null && <span>wind {Math.round(d.windKmh)} km/h</span>}
            {d.gustKmh != null && <span>gust {Math.round(d.gustKmh)} km/h</span>}
            {dir && <span>from {dir}</span>}
          </div>
          <p style={{ fontSize: '10px', color: '#8a8a82', fontStyle: 'italic', lineHeight: 1.45, margin: '10px 0 0' }}>{AREA_FORECAST_CAVEAT}</p>
          {data?.error && <p style={{ fontSize: '10px', color: '#e57373', marginTop: '6px' }}>Weather: {data.error}</p>}
        </>
      )}
    </div>
  )
}
