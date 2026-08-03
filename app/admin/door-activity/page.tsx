'use client'
import { useState, useEffect } from 'react'

const PROP: Record<string, string> = { 'royal-york-east': 'Royal York East', 'royal-york-west': 'Royal York West', 'nickel-beach': 'Nickel Beach' }

function iconFor(type: string) {
  if (type === 'booking.checked_in') return { i: '✓', c: '#7bc47b' }
  if (type === 'door.denied') return { i: '✕', c: '#e57373' }
  return { i: '⚿', c: '#7bc4c4' }
}

export default function DoorActivityPage() {
  const [entries, setEntries] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  function load(p = filter) {
    setLoading(true)
    fetch(`/api/admin/door-activity?property=${p}`).then(r => r.json()).then(d => setEntries(d.entries || [])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  // group by day
  const byDay: Record<string, any[]> = {}
  for (const e of entries) {
    const day = new Date(e.created_at).toLocaleDateString('en-US', { timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric' })
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(e)
  }

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '30px', color: '#F0EDE6', margin: '0 0 4px' }}>Door Activity</h1>
      <p style={{ fontSize: '12px', color: '#9A9A92', marginBottom: '18px' }}>Every code entry and check-in across your locks, newest first.</p>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {['all', 'royal-york-east', 'royal-york-west', 'nickel-beach'].map(p => (
          <button key={p} onClick={() => { setFilter(p); load(p) }}
            style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '5px', border: '0.5px solid #363634', cursor: 'pointer', background: filter === p ? 'var(--amber)' : '#242422', color: filter === p ? '#242422' : '#AEAEA6' }}>
            {p === 'all' ? 'All' : PROP[p]}
          </button>
        ))}
      </div>

      {loading ? <div style={{ color: '#666660', fontSize: '13px' }}>Loading…</div> :
        entries.length === 0 ? <div style={{ padding: '18px', fontSize: '13px', color: '#666660', background: '#242422', borderRadius: '8px', border: '0.5px solid #363634' }}>No door activity yet. Entries appear here when a guest uses their code.</div> :
        Object.entries(byDay).map(([day, evs]) => (
          <div key={day} style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.08em', color: '#8A8A82', marginBottom: '8px' }}>{day}</div>
            <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '8px', overflow: 'hidden' }}>
              {evs.map(e => {
                const ic = iconFor(e.event_type)
                const time = new Date(e.created_at).toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' })
                return (
                  <div key={e.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '11px 16px', borderTop: '0.5px solid #2A2A28' }}>
                    <span style={{ fontSize: '14px', width: '18px', textAlign: 'center', color: ic.c }}>{ic.i}</span>
                    <div style={{ flex: 1, fontSize: '13px', color: '#F0EDE6' }}>{e.summary}</div>
                    <div style={{ fontSize: '11px', color: '#8A8A82', fontVariantNumeric: 'tabular-nums' }}>{time}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      }
    </div>
  )
}
