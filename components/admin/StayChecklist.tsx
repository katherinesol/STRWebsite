'use client'
import { useState, useEffect } from 'react'

export default function StayChecklist({ propertyId, bookingId }: { propertyId: string; bookingId: string }) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  function load() {
    fetch(`/api/admin/tasks/stay?property=${propertyId}&booking=${bookingId}`)
      .then(r => r.json())
      .then(d => { if (d.checklist) setItems(d.checklist) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [propertyId, bookingId])

  async function toggle(taskId: string, currentlyDone: boolean) {
    if (currentlyDone) return
    await fetch('/api/admin/tasks/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, booking_id: bookingId }),
    })
    load()
  }

  if (loading) return null
  if (!items.length) return null

  const doneCount = items.filter(i => i.done).length

  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '18px 20px', marginBottom: '16px', borderRadius: '2px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)' }}>Turnover checklist</div>
        <div style={{ fontSize: '11px', color: '#9A9A92' }}>{doneCount}/{items.length} done</div>
      </div>
      {items.map(it => (
        <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0' }}>
          <button onClick={() => toggle(it.id, it.done)} style={{ width: '20px', height: '20px', borderRadius: '4px', border: it.done ? 'none' : '1.5px solid #4A4A48', background: it.done ? '#2ecc71' : 'none', color: '#1A1A18', cursor: it.done ? 'default' : 'pointer', flexShrink: 0, fontSize: '12px' }}>{it.done ? '✓' : ''}</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', color: it.done ? '#9A9A92' : '#F0EDE6', textDecoration: it.done ? 'line-through' : 'none' }}>{it.title}</div>
            {it.done && it.doneBy && <div style={{ fontSize: '10px', color: '#666660' }}>by {it.doneBy} · {new Date(it.doneAt).toLocaleDateString()}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
