'use client'
import { useState, useEffect } from 'react'
import { L, F, microLabel, cardStyle } from '@/lib/design-tokens'

// System Activity in the light shell. Same endpoint, same type filter, same
// ordering as the legacy screen — only the palette moved onto the tokens.

const ICON: Record<string, string> = {
  'lock.programmed': '⚿', 'lock.revoked': '⊘', 'lock.reprogrammed': '↻',
  'booking.checked_in': '✓', 'booking.cancelled': '✕', 'booking.removed': '🗑',
  'cron.ran': '◷', 'code.failed': '⚠', 'water.delivered': '💧',
}

// A failure should not read like a sync. The legacy screen rendered every icon
// in the same grey, so 'code.failed' sat in the list looking exactly as routine
// as 'cron.ran' — which is not what a log is for.
function colourFor(type: string) {
  if (type === 'code.failed' || type.endsWith('.cancelled') || type.endsWith('.removed')) return L.red
  if (type === 'booking.checked_in' || type === 'lock.programmed') return L.green
  return L.inkFaint
}

export default function SystemLogPage() {
  const [entries, setEntries] = useState<any[]>([])
  const [types, setTypes] = useState<string[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  function load(t = filter) {
    setLoading(true)
    fetch(`/api/admin/system-log?type=${t}`)
      .then(r => r.json())
      .then(d => { setEntries(d.entries || []); setTypes(d.types || []) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const tab = (on: boolean): React.CSSProperties => ({
    padding: '6px 13px', fontSize: '12px', borderRadius: '99px', cursor: 'pointer',
    fontFamily: F.mono,
    border: `1px solid ${on ? L.ink : L.line}`,
    background: on ? L.ink : L.card,
    color: on ? '#fff' : L.inkMuted,
    fontWeight: on ? 600 : 400,
  })

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', paddingTop: '28px' }}>
      <h1 style={{ fontFamily: F.serif, fontWeight: 300, fontSize: '32px', color: L.ink, margin: '0 0 6px' }}>
        System Activity
      </h1>
      <p style={{ fontSize: '13px', color: L.inkMuted, margin: '0 0 22px' }}>
        Everything the system does automatically — locks, check-ins, syncs, alerts.
      </p>

      <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginBottom: '22px' }}>
        {['all', ...types].map(t => (
          <button key={t} onClick={() => { setFilter(t); load(t) }} style={tab(filter === t)}>{t}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: L.inkFaint, fontSize: '13px' }}>Loading…</div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          {entries.length === 0 && (
            <div style={{ padding: '22px', fontSize: '13px', color: L.inkMuted }}>Nothing logged yet.</div>
          )}
          {entries.map((e, i) => (
            <div key={e.id} style={{
              display: 'flex', gap: '13px', padding: '12px 17px',
              borderTop: i === 0 ? 'none' : `1px solid ${L.lineFaint}`,
            }}>
              <span style={{ fontSize: '14px', width: '20px', textAlign: 'center', color: colourFor(e.event_type) }}>
                {ICON[e.event_type] || '•'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', color: L.ink }}>{e.summary}</div>
                <div style={{ ...microLabel, fontSize: '10px', marginTop: '3px', textTransform: 'none', letterSpacing: '0.04em' }}>
                  {e.event_type} · {new Date(e.created_at).toLocaleString('en-US',
                    { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {e.property_id ? ' · ' + e.property_id : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
