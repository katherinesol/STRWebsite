'use client'
import { useState, useEffect } from 'react'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', background: '#363634',
  border: '0.5px solid #4A4A48', color: '#F5F2EC',
  fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
}

export default function CisternLevel() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [full, setFull] = useState('')
  const [empty, setEmpty] = useState('')
  const [threshold, setThreshold] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    fetch('/api/admin/cistern')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setData(d)
        setFull(String(d.fullPoint))
        setEmpty(String(d.emptyPoint))
        setThreshold(String(d.lowThreshold))
      })
      .catch(() => setError('Could not load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function saveCalibration() {
    setSaving(true)
    try {
      await fetch('/api/admin/cistern', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_point: full, empty_point: empty, low_threshold: threshold }),
      })
      setEditing(false)
      setLoading(true)
      load()
    } finally { setSaving(false) }
  }

  if (loading) return <div style={{ fontSize: '12px', color: '#666660', padding: '16px' }}>Loading cistern level…</div>
  if (error) return null

  const pct = data?.percent ?? null
  const low = pct != null && pct <= (data?.lowThreshold ?? 25)
  const barColor = low ? '#e74c3c' : pct != null && pct <= 50 ? '#f39c12' : '#2ecc71'

  return (
    <div style={{ background: '#242422', border: low ? '0.5px solid #e74c3c' : '0.5px solid #363634', padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)' }}>
          Nickel Beach cistern
        </div>
        {low && (
          <span style={{ fontSize: '9px', padding: '3px 10px', background: '#2a1518', color: '#e74c3c', letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500 }}>
            ⚠ Refill needed
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontFamily: 'var(--serif)', fontSize: '36px', fontWeight: 300, color: low ? '#e74c3c' : '#F5F2EC', lineHeight: 1 }}>
          {pct != null ? `${pct}%` : '—'}
        </span>
        {data?.rawPercent != null && (
          <span style={{ fontSize: '11px', color: '#666660' }}>raw {data.rawPercent}%</span>
        )}
        {data?.battery && (
          <span style={{ fontSize: '11px', color: '#9A9A92' }}>· Battery {data.battery}</span>
        )}
      </div>

      <div style={{ height: '8px', background: '#1A1A18', borderRadius: '2px', overflow: 'hidden', marginBottom: '10px' }}>
        <div style={{ height: '100%', width: `${pct ?? 0}%`, background: barColor, transition: 'width .4s' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '11px', color: '#666660' }}>
          {data?.reported && `Updated ${data.reported}`}
        </div>
        <button onClick={() => setEditing(e => !e)}
          style={{ background: 'none', border: 'none', color: '#9A9A92', fontSize: '10px', letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
          {editing ? 'Close' : 'Calibrate'}
        </button>
      </div>

      {low && !editing && (
        <div style={{ marginTop: '12px', fontSize: '12px', color: '#e74c3c' }}>
          At or below {data?.lowThreshold}% — time to schedule a delivery.
        </div>
      )}

      {editing && (
        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '0.5px solid #363634' }}>
          <div style={{ fontSize: '11px', color: '#9A9A92', marginBottom: '10px', lineHeight: 1.5 }}>
            Enter the raw % the sensor reports when the tank is full and empty. Currently raw reads <strong style={{ color: '#F5F2EC' }}>{data?.rawPercent}%</strong>.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '4px' }}>Full = raw %</div>
              <input type="number" value={full} onChange={e => setFull(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '4px' }}>Empty = raw %</div>
              <input type="number" value={empty} onChange={e => setEmpty(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '4px' }}>Alert at %</div>
              <input type="number" value={threshold} onChange={e => setThreshold(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <button onClick={saveCalibration} disabled={saving}
            style={{ padding: '8px 18px', background: 'var(--amber)', color: '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 500 }}>
            {saving ? 'Saving…' : 'Save calibration'}
          </button>
        </div>
      )}
    </div>
  )
}
