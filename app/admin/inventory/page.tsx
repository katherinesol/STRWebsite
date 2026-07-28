'use client'
import { useState, useEffect } from 'react'

const PROP_NAMES: Record<string, string> = { 'royal-york-east': 'Royal York East', 'royal-york-west': 'Royal York West', 'nickel-beach': 'Nickel Beach Retreat', 'royal-york-both': 'Royal York (East + West)' }
const money = (v: any) => v === null || v === undefined ? '—' : '$' + Number(v).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function InventoryPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/api/admin/inventory').then(r => r.json()).then(d => { if (d.items) setItems(d.items) }).finally(() => setLoading(false))
  }, [])

  const filtered = q.trim()
    ? items.filter(i => (i.name + ' ' + i.vendor).toLowerCase().includes(q.toLowerCase()))
    : items

  const props = Array.from(new Set(filtered.map(i => i.property_id || 'unassigned')))

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '30px', color: '#F0EDE6', margin: '0 0 4px' }}>Inventory</h1>
      <p style={{ fontSize: '12px', color: '#9A9A92', marginBottom: '18px' }}>What you own, pulled from receipts — with what it cost and where to rebuy it.</p>

      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search items or stores…"
        style={{ width: '100%', maxWidth: '360px', padding: '10px 14px', background: '#242422', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '13px', borderRadius: '6px', marginBottom: '20px', boxSizing: 'border-box' }} />

      {loading && <div style={{ color: '#666660', fontSize: '13px' }}>Loading…</div>}

      {!loading && items.length === 0 && (
        <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '6px', padding: '20px', fontSize: '13px', color: '#9A9A92', lineHeight: 1.6 }}>
          No itemized receipts yet. Scan a receipt in Expenses and its individual items will appear here — older receipts can be re-scanned to add them.
        </div>
      )}

      {!loading && props.map(pid => {
        const list = filtered.filter(i => (i.property_id || 'unassigned') === pid)
        return (
          <div key={pid} style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '6px', marginBottom: '18px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', fontSize: '13px', color: '#F0EDE6', borderBottom: '0.5px solid #363634' }}>
              {PROP_NAMES[pid] || 'Unassigned'} <span style={{ color: '#666660', fontSize: '11px' }}>· {list.length} item{list.length === 1 ? '' : 's'}</span>
            </div>
            {list.map((i, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '14px', alignItems: 'center', padding: '11px 16px', borderTop: idx ? '0.5px solid #2A2A28' : 'none' }}>
                <div>
                  <div style={{ fontSize: '13px', color: '#F0EDE6' }}>{i.qty > 1 ? `${i.qty}× ` : ''}{i.name}</div>
                  <div style={{ fontSize: '11px', color: '#8A8A82', marginTop: '2px' }}>{i.vendor || 'Unknown store'} · {i.date}</div>
                </div>
                <div style={{ fontSize: '13px', color: '#AEAEA6', textAlign: 'right' }}>{money(i.amount)}</div>
                {i.receipt_path
                  ? <a href={`/api/admin/photo?path=${encodeURIComponent(i.receipt_path)}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: 'var(--amber)', textDecoration: 'none' }}>receipt</a>
                  : <span style={{ fontSize: '11px', color: '#4A4A48' }}>—</span>}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
