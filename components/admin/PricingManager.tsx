'use client'
import { useState } from 'react'
import { priceForDate, minStayForDate, type PricingConfig, type Override } from '@/lib/pricing'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: '#363634',
  border: '0.5px solid #4A4A48', color: '#F5F2EC',
  fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
}

function toStr(d: Date) { return d.toISOString().split('T')[0] }

export default function PricingManager({ propertyId, initialConfig, initialOverrides }: {
  propertyId: string
  initialConfig: PricingConfig
  initialOverrides: Override[]
}) {
  const [config, setConfig] = useState<PricingConfig>(initialConfig)
  const [overrides, setOverrides] = useState<Override[]>(initialOverrides)
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)

  // range selection for new override
  const [rangeStart, setRangeStart] = useState<string | null>(null)
  const [rangeEnd, setRangeEnd] = useState<string | null>(null)
  const [ovRate, setOvRate] = useState('')
  const [ovMinStay, setOvMinStay] = useState('')
  const [ovLabel, setOvLabel] = useState('')

  async function saveConfig() {
    setSavingConfig(true)
    try {
      await fetch('/api/admin/pricing', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          base_rate: parseFloat(String(config.base_rate)) || 0,
          weekend_rate: config.weekend_rate ? parseFloat(String(config.weekend_rate)) : null,
          min_stay: parseInt(String(config.min_stay)) || 1,
          cleaning_fee: parseFloat(String(config.cleaning_fee)) || 0,
        }),
      })
      setConfigSaved(true)
      setTimeout(() => setConfigSaved(false), 2000)
    } finally { setSavingConfig(false) }
  }

  function handleDayClick(dateStr: string) {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      setRangeStart(dateStr); setRangeEnd(null)
    } else if (dateStr >= rangeStart) {
      setRangeEnd(dateStr)
    } else {
      setRangeStart(dateStr); setRangeEnd(null)
    }
  }

  async function addOverride() {
    if (!rangeStart) return
    const end = rangeEnd || rangeStart
    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          start_date: rangeStart,
          end_date: end,
          rate: ovRate ? parseFloat(ovRate) : null,
          min_stay: ovMinStay ? parseInt(ovMinStay) : null,
          label: ovLabel || null,
        }),
      })
      const data = await res.json()
      if (data.override) {
        setOverrides(o => [...o, data.override].sort((a, b) => a.start_date.localeCompare(b.start_date)))
        setRangeStart(null); setRangeEnd(null); setOvRate(''); setOvMinStay(''); setOvLabel('')
      }
    } catch {}
  }

  async function deleteOverride(id: string) {
    setOverrides(o => o.filter(x => x.id !== id))
    await fetch(`/api/admin/pricing?id=${id}`, { method: 'DELETE' })
  }

  const year = month.getFullYear()
  const m = month.getMonth()
  const firstDow = new Date(year, m, 1).getDay()
  const daysInMonth = new Date(year, m + 1, 0).getDate()
  const cells: (string | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => toStr(new Date(Date.UTC(year, m, i + 1)))),
  ]

  function inSelectedRange(ds: string) {
    if (!rangeStart) return false
    const end = rangeEnd || rangeStart
    return ds >= rangeStart && ds <= end
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', maxWidth: '760px' }}>
      {/* base config */}
      <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '20px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>Base rates</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Base nightly rate ($)</div>
            <input type="number" value={config.base_rate} onChange={e => setConfig(c => ({ ...c, base_rate: e.target.value as any }))} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Weekend rate (Fri/Sat)</div>
            <input type="number" value={config.weekend_rate ?? ''} onChange={e => setConfig(c => ({ ...c, weekend_rate: e.target.value as any }))} placeholder="same as base" style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Default min stay (nights)</div>
            <input type="number" value={config.min_stay} onChange={e => setConfig(c => ({ ...c, min_stay: e.target.value as any }))} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Cleaning fee ($)</div>
            <input type="number" value={config.cleaning_fee} onChange={e => setConfig(c => ({ ...c, cleaning_fee: e.target.value as any }))} style={inputStyle} />
          </div>
        </div>
        <button onClick={saveConfig} disabled={savingConfig}
          style={{ marginTop: '16px', padding: '9px 20px', background: 'var(--amber)', color: '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 500 }}>
          {savingConfig ? 'Saving...' : 'Save base rates'}
        </button>
        {configSaved && <span style={{ marginLeft: '12px', fontSize: '11px', color: '#2ecc71' }}>✓ Saved</span>}
      </div>

      {/* calendar */}
      <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <button onClick={() => setMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} style={{ background: 'none', border: 'none', color: '#9A9A92', cursor: 'pointer', fontSize: '16px' }}>←</button>
          <div style={{ fontSize: '13px', color: '#F5F2EC', letterSpacing: '.06em', textTransform: 'uppercase' }}>
            {month.toLocaleString('en-CA', { month: 'long', year: 'numeric' })}
          </div>
          <button onClick={() => setMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={{ background: 'none', border: 'none', color: '#9A9A92', cursor: 'pointer', fontSize: '16px' }}>→</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
          {['S','M','T','W','T','F','S'].map((d, i) => (
            <div key={i} style={{ fontSize: '9px', color: '#666660', textAlign: 'center', padding: '4px 0' }}>{d}</div>
          ))}
          {cells.map((ds, i) => {
            if (!ds) return <div key={i} />
            const rate = priceForDate(ds, config, overrides)
            const hasOverride = overrides.some(o => ds >= o.start_date && ds <= o.end_date)
            const selected = inSelectedRange(ds)
            const dayNum = parseInt(ds.slice(8))
            return (
              <button key={i} onClick={() => handleDayClick(ds)}
                style={{
                  padding: '6px 2px', minHeight: '46px', border: 'none', cursor: 'pointer',
                  background: selected ? 'var(--amber)' : hasOverride ? '#2a2419' : '#1E1E1C',
                  color: selected ? '#1A1A18' : '#F5F2EC',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
                }}>
                <span style={{ fontSize: '11px' }}>{dayNum}</span>
                <span style={{ fontSize: '9px', color: selected ? '#1A1A18' : hasOverride ? 'var(--amber)' : '#9A9A92' }}>${rate}</span>
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: '10px', color: '#666660', marginTop: '10px' }}>
          Tap a start then end date to select a range, then set an override below. Amber-priced days have overrides.
        </div>
      </div>

      {/* override editor for selected range */}
      {rangeStart && (
        <div style={{ background: '#242422', border: '0.5px solid var(--amber)', padding: '20px' }}>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '12px' }}>
            Override: {rangeStart}{rangeEnd && rangeEnd !== rangeStart ? ` → ${rangeEnd}` : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Rate ($)</div>
              <input type="number" value={ovRate} onChange={e => setOvRate(e.target.value)} placeholder="leave blank to keep" style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Min stay</div>
              <input type="number" value={ovMinStay} onChange={e => setOvMinStay(e.target.value)} placeholder="optional" style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Label</div>
              <input type="text" value={ovLabel} onChange={e => setOvLabel(e.target.value)} placeholder="e.g. Summer, Holiday" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button onClick={addOverride} style={{ padding: '9px 20px', background: 'var(--amber)', color: '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 500 }}>
              Add override
            </button>
            <button onClick={() => { setRangeStart(null); setRangeEnd(null) }} style={{ padding: '9px 16px', background: '#363634', color: '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* active overrides list */}
      {overrides.length > 0 && (
        <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '20px' }}>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '14px' }}>Active overrides</div>
          {overrides.map(o => (
            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid #363634' }}>
              <div>
                <div style={{ fontSize: '13px', color: '#F5F2EC' }}>
                  {o.label || 'Override'} {o.rate != null && `· $${o.rate}/night`} {o.min_stay != null && `· ${o.min_stay}-night min`}
                </div>
                <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>{o.start_date} → {o.end_date}</div>
              </div>
              <button onClick={() => deleteOverride(o.id)} style={{ padding: '5px 10px', background: '#2a1518', border: 'none', color: '#e74c3c', fontFamily: 'var(--sans)', fontSize: '10px', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
