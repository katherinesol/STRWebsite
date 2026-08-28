'use client'
import { useState, useEffect } from 'react'
import { L, F, microLabel, cardStyle } from '@/lib/design-tokens'

// Door Activity in the light shell. Behaviour is the legacy screen's, unchanged:
// same endpoint, same property filter, same newest-first grouping by Toronto day.
// Only the palette moved, from hardcoded #242422/#F0EDE6 onto the tokens.

const PROP: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach': 'Nickel Beach',
}

// Three outcomes, three readings. Denied is the one worth spotting from across
// the room, so it gets the only saturated colour on the page.
function iconFor(type: string) {
  if (type === 'booking.checked_in') return { i: '✓', c: L.green }
  if (type === 'door.denied') return { i: '✕', c: L.red }
  return { i: '⚿', c: L.inkMuted }
}

export default function DoorActivityPage() {
  const [entries, setEntries] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  function load(p = filter) {
    setLoading(true)
    fetch(`/api/admin/door-activity?property=${p}`)
      .then(r => r.json())
      .then(d => setEntries(d.entries || []))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const byDay: Record<string, any[]> = {}
  for (const e of entries) {
    const day = new Date(e.created_at).toLocaleDateString('en-US',
      { timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric' })
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(e)
  }

  const tab = (on: boolean): React.CSSProperties => ({
    padding: '7px 14px', fontSize: '12px', borderRadius: '99px', cursor: 'pointer',
    fontFamily: 'inherit',
    border: `1px solid ${on ? L.ink : L.line}`,
    background: on ? L.ink : L.card,
    color: on ? '#fff' : L.inkMuted,
    fontWeight: on ? 600 : 400,
  })

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', paddingTop: '28px' }}>
      <h1 style={{ fontFamily: F.serif, fontWeight: 300, fontSize: '32px', color: L.ink, margin: '0 0 6px' }}>
        Door Activity
      </h1>
      <p style={{ fontSize: '13px', color: L.inkMuted, margin: '0 0 22px' }}>
        Every code entry and check-in across your locks, newest first.
      </p>

      <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginBottom: '24px' }}>
        {['all', 'royal-york-east', 'royal-york-west', 'nickel-beach'].map(p => (
          <button key={p} onClick={() => { setFilter(p); load(p) }} style={tab(filter === p)}>
            {p === 'all' ? 'All' : PROP[p]}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: L.inkFaint, fontSize: '13px' }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{ ...cardStyle, padding: '22px', fontSize: '13px', color: L.inkMuted }}>
          No door activity yet. Entries appear here when a guest uses their code.
        </div>
      ) : (
        Object.entries(byDay).map(([day, evs]) => (
          <div key={day} style={{ marginBottom: '22px' }}>
            <div style={{ ...microLabel, marginBottom: '9px' }}>{day}</div>
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              {evs.map((e, i) => {
                const ic = iconFor(e.event_type)
                const time = new Date(e.created_at).toLocaleTimeString('en-US',
                  { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' })
                return (
                  <div key={e.id} style={{
                    display: 'flex', gap: '13px', alignItems: 'center', padding: '12px 17px',
                    borderTop: i === 0 ? 'none' : `1px solid ${L.lineFaint}`,
                  }}>
                    <span style={{ fontSize: '14px', width: '18px', textAlign: 'center', color: ic.c }}>{ic.i}</span>
                    <div style={{ flex: 1, fontSize: '14px', color: L.ink }}>{e.summary}</div>
                    <div style={{ fontSize: '12px', color: L.inkFaint, fontFamily: F.mono, fontVariantNumeric: 'tabular-nums' }}>{time}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
