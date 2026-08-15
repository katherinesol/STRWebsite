'use client'
import { useState, useEffect } from 'react'

const ICON: Record<string, { symbol: string; color: string }> = {
  new_booking:   { symbol: '+', color: '#7bc47b' },
  extended:      { symbol: '↗', color: '#c9a24a' },
  cancelled:     { symbol: '✕', color: '#e57373' },
  date_change:   { symbol: '⇄', color: '#6a9fd8' },
  time_request:  { symbol: '🕐', color: '#e6a86a' },
  time_approved: { symbol: '✓', color: '#7bc47b' },
  block_added:   { symbol: '▦', color: '#9A9A92' },
  block_removed: { symbol: '▢', color: '#9A9A92' },
}

// shared cache so all bars fetch once
let _cache: any = null
let _fetching: Promise<any> | null = null
function loadChanges() {
  if (_cache) return Promise.resolve(_cache)
  if (!_fetching) _fetching = fetch('/api/admin/calendar/changes').then(r => r.json()).then(d => { _cache = d; return d })
  return _fetching
}

export default function PropertyChangeBar({ propertyId, propertyName }: { propertyId: string; propertyName?: string }) {
  const [events, setEvents] = useState<any[]>([])
  const [seen, setSeen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    loadChanges().then(d => { setEvents((d.byProperty?.[propertyId]) || []); setLoaded(true) }).catch(() => setLoaded(true))
  }, [propertyId])

  async function markSeen() {
    setSeen(true)
    _cache = null  // bust cache so other bars refresh
    await fetch('/api/admin/calendar/changes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ property_id: propertyId }) })
  }

  if (!loaded) return null
  if (seen || events.length === 0) {
    return <div style={{ fontSize: '10px', color: '#5a7a5a', marginBottom: '6px' }}>✓ caught up</div>
  }

  return (
    <div style={{ background: '#2a2416', border: '0.5px solid #4a3f1f', borderRadius: '8px', padding: '8px 12px', marginBottom: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '9px', fontWeight: 700, background: 'var(--amber)', color: '#242422', padding: '1px 6px', borderRadius: '8px' }}>{events.length} new</span>
        {events.slice(0, 5).map((e: any) => {
          const ic = ICON[e.type] || { symbol: '•', color: '#9A9A92' }
          return (
            <span key={e.id} style={{ fontSize: '11px', color: '#F0EDE6' }}>
              <span style={{ color: ic.color, marginRight: '3px' }}>{ic.symbol}</span>{e.description}
            </span>
          )
        })}
        {events.length > 5 && <span style={{ fontSize: '10px', color: '#9A9A92' }}>+{events.length - 5} more</span>}
        <span onClick={markSeen} style={{ marginLeft: 'auto', fontSize: '10px', color: '#9A9A92', cursor: 'pointer', whiteSpace: 'nowrap' }}>Mark seen ✓</span>
      </div>
    </div>
  )
}
