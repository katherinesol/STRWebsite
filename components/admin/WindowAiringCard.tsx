'use client'
import { useState, useEffect } from 'react'

const STATE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  'FULL OPEN': { bg: '#16281a', color: '#7bc47b', label: 'Full open' },
  'TILT':      { bg: '#2a2416', color: '#c9a24a', label: 'Tilt' },
  'CLOSED':    { bg: '#2a1a1a', color: '#e57373', label: 'Closed' },
  'UNKNOWN':   { bg: '#242422', color: '#9A9A92', label: 'Unknown' },
}

export default function WindowAiringCard() {
  const [data, setData] = useState<any>(null)
  const [smoke, setSmoke] = useState(false)
  const [loading, setLoading] = useState(true)

  function load(smokeMode: boolean) {
    setLoading(true)
    fetch(`/api/admin/window-airing${smokeMode ? '?smoke=1' : ''}`)
      .then(r => r.json()).then(d => setData(d)).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load(smoke) }, [smoke])

  const st = STATE_STYLE[data?.state] || STATE_STYLE.UNKNOWN
  const d = data?.detail || {}

  return (
    <div style={{ background: '#1E1E1C', border: '0.5px solid #363634', borderRadius: '10px', padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', color: '#F0EDE6', fontWeight: 500 }}>Royal York · Air-out</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: '#9A9A92', cursor: 'pointer' }}>
          <input type="checkbox" checked={smoke} onChange={e => setSmoke(e.target.checked)} style={{ cursor: 'pointer' }} />
          Smoke mode
        </label>
      </div>

      {loading ? <div style={{ fontSize: '12px', color: '#666660' }}>Checking weather…</div> : (
        <>
          <div style={{ display: 'inline-block', background: st.bg, color: st.color, padding: '6px 14px', borderRadius: '6px', fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>
            {st.label}
          </div>
          <p style={{ fontSize: '12px', color: '#B8B8B0', lineHeight: 1.5, margin: '0 0 10px' }}>{data?.reason}</p>
          {data?.note && <p style={{ fontSize: '11px', color: '#8a8a82', fontStyle: 'italic', margin: '0 0 10px' }}>{data.note}</p>}
          <div style={{ display: 'flex', gap: '14px', fontSize: '10px', color: '#777770', flexWrap: 'wrap' }}>
            {d.tempC != null && <span>{Math.round(d.tempC)}°C</span>}
            {d.dewPointC != null && <span>dew {Math.round(d.dewPointC)}°C</span>}
            {d.windGustKmh != null && <span>gust {Math.round(d.windGustKmh)} km/h</span>}
            {d.rainProb2h != null && <span>rain {d.rainProb2h}%</span>}
          </div>
          {data?.error && <p style={{ fontSize: '10px', color: '#e57373', marginTop: '6px' }}>Weather: {data.error}</p>}
        </>
      )}
    </div>
  )
}
