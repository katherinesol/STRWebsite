'use client'
import { useState, useEffect } from 'react'

const ICON: Record<string, string> = {
  'lock.programmed': '⚿', 'lock.revoked': '⊘', 'lock.reprogrammed': '↻',
  'booking.checked_in': '✓', 'booking.cancelled': '✕', 'booking.removed': '🗑',
  'cron.ran': '◷', 'code.failed': '⚠', 'water.delivered': '💧',
}

export default function SystemLogPage() {
  const [entries, setEntries] = useState<any[]>([])
  const [types, setTypes] = useState<string[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  function load(t = filter) {
    setLoading(true)
    fetch(`/api/admin/system-log?type=${t}`).then(r => r.json()).then(d => { setEntries(d.entries || []); setTypes(d.types || []) }).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '30px', color: '#F0EDE6', margin: '0 0 4px' }}>System Activity</h1>
      <p style={{ fontSize: '12px', color: '#9A9A92', marginBottom: '18px' }}>Everything the system does automatically — locks, check-ins, syncs, alerts.</p>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '18px' }}>
        {['all', ...types].map(t => (
          <button key={t} onClick={() => { setFilter(t); load(t) }}
            style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '5px', border: '0.5px solid #363634', cursor: 'pointer', background: filter === t ? 'var(--amber)' : '#242422', color: filter === t ? '#242422' : '#AEAEA6' }}>
            {t}
          </button>
        ))}
      </div>

      {loading ? <div style={{ color: '#666660', fontSize: '13px' }}>Loading…</div> : (
        <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '8px', overflow: 'hidden' }}>
          {entries.length === 0 && <div style={{ padding: '18px', fontSize: '13px', color: '#666660' }}>Nothing logged yet.</div>}
          {entries.map(e => (
            <div key={e.id} style={{ display: 'flex', gap: '12px', padding: '11px 16px', borderTop: '0.5px solid #2A2A28' }}>
              <span style={{ fontSize: '14px', width: '20px', textAlign: 'center', color: '#9A9A92' }}>{ICON[e.event_type] || '•'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', color: '#F0EDE6' }}>{e.summary}</div>
                <div style={{ fontSize: '10px', color: '#666660', marginTop: '2px' }}>
                  {e.event_type} · {new Date(e.created_at).toLocaleString('en-US', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{e.property_id ? ' · ' + e.property_id : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
