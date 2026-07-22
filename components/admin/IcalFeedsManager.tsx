'use client'
import { useState, useEffect } from 'react'

const PROPERTIES = [
  { id: 'royal-york-east', name: 'Royal York East' },
  { id: 'royal-york-west', name: 'Royal York West' },
  { id: 'nickel-beach', name: 'Nickel Beach' },
]
const platformColor: Record<string, string> = { airbnb: '#FF5A5F', vrbo: '#3D67FF', houfy: '#e67e22', other: '#9A9A92' }

export default function IcalFeedsManager() {
  const [feeds, setFeeds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [addFor, setAddFor] = useState<string | null>(null)
  const [newUrl, setNewUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function load() {
    fetch('/api/admin/ical-feeds').then(r => r.json()).then(d => { if (d.feeds) setFeeds(d.feeds) }).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function add(property_id: string) {
    if (!newUrl.trim()) return
    setBusy(true); setError('')
    const res = await fetch('/api/admin/ical-feeds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ property_id, url: newUrl }) })
    const d = await res.json()
    setBusy(false)
    if (d.error) { setError(d.error); return }
    setNewUrl(''); setAddFor(null); load()
  }
  async function toggle(id: string, active: boolean) {
    await fetch('/api/admin/ical-feeds', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, active }) })
    load()
  }
  async function del(id: string) {
    if (!window.confirm('Remove this calendar feed?')) return
    await fetch('/api/admin/ical-feeds', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    load()
  }

  if (loading) return null
  const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontSize: '13px', outline: 'none', boxSizing: 'border-box', borderRadius: '3px' }

  return (
    <div style={{ marginTop: '28px' }}>
      <div style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '4px' }}>Calendar Sync (Import)</div>
      <p style={{ fontSize: '12px', color: '#666660', marginTop: 0, marginBottom: '16px' }}>Paste Airbnb, VRBO, or Houfy iCal links to sync their bookings in. Platform is detected automatically.</p>

      {PROPERTIES.map(prop => {
        const propFeeds = feeds.filter(f => f.property_id === prop.id)
        return (
          <div key={prop.id} style={{ marginBottom: '18px', background: '#242422', border: '0.5px solid #363634', borderRadius: '4px', padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: propFeeds.length ? '10px' : '0' }}>
              <span style={{ fontSize: '14px', color: '#F0EDE6' }}>{prop.name}</span>
              <button onClick={() => { setAddFor(addFor === prop.id ? null : prop.id); setNewUrl(''); setError('') }} style={{ padding: '5px 12px', background: '#363634', color: '#AEAEA6', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '3px' }}>{addFor === prop.id ? 'Cancel' : '+ Add feed'}</button>
            </div>

            {propFeeds.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderTop: '0.5px solid #2A2A28' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: platformColor[f.platform] || '#9A9A92', minWidth: '52px' }}>{f.platform}</span>
                <span style={{ flex: 1, fontSize: '11px', color: '#888880', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.url}</span>
                <button onClick={() => toggle(f.id, !f.active)} style={{ fontSize: '10px', color: f.active ? '#2ecc71' : '#666660', background: 'none', border: 'none', cursor: 'pointer' }}>{f.active ? 'active' : 'paused'}</button>
                <button onClick={() => del(f.id)} style={{ fontSize: '12px', color: '#666660', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            ))}

            {addFor === prop.id && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                <input autoFocus placeholder="Paste iCal URL (https://...)" value={newUrl} onChange={e => setNewUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(prop.id) }} style={inp} />
                <button onClick={() => add(prop.id)} disabled={busy || !newUrl.trim()} style={{ padding: '8px 16px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '3px', whiteSpace: 'nowrap' }}>{busy ? '…' : 'Add'}</button>
              </div>
            )}
          </div>
        )
      })}
      {error && <div style={{ color: '#e74c3c', fontSize: '12px' }}>{error}</div>}
    </div>
  )
}
