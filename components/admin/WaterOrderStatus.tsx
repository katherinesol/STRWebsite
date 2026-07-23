'use client'
import { useState, useEffect } from 'react'

export default function WaterOrderStatus() {
  const [open, setOpen] = useState<any>(null)
  const [companies, setCompanies] = useState<string[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [company, setCompany] = useState('')
  const [newCompany, setNewCompany] = useState('')
  const [expected, setExpected] = useState('')
  const [saving, setSaving] = useState(false)

  function load() {
    fetch('/api/admin/water-order').then(r => r.json()).then(d => {
      setOpen(d.open || null); setCompanies(d.companies || []); setHistory(d.history || [])
    }).finally(() => setLoading(false))
  }
  useEffect(() => {
    load()
    // check role for edit permissions
    fetch('/api/admin/tasks').then(r => r.json()).then(d => { if (d.role === 'owner' || d.role === 'co-owner') setCanEdit(true) }).catch(() => {})
  }, [])

  async function record() {
    setSaving(true)
    const comp = newCompany.trim() || company
    await fetch('/api/admin/water-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company: comp, expected_date: expected || null }) })
    setSaving(false); setShowForm(false); setCompany(''); setNewCompany(''); setExpected(''); load()
  }

  async function markDelivered() {
    if (!open) return
    await fetch('/api/admin/water-order', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: open.id }) })
    load()
  }

  if (loading) return null

  const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontSize: '13px', outline: 'none', boxSizing: 'border-box', borderRadius: '2px' }

  const HistoryBlock = () => history.length === 0 ? null : (
    <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '0.5px solid #2A2A28' }}>
      <button onClick={() => setShowHistory(s => !s)} style={{ background: 'none', border: 'none', color: '#666660', fontSize: '10px', cursor: 'pointer', padding: 0 }}>
        {showHistory ? 'Hide' : 'Past deliveries'} ({history.length})
      </button>
      {showHistory && (
        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {history.map((h: any) => (
            <div key={h.id} style={{ fontSize: '11px', color: '#8A8A82' }}>
              {h.delivered_at ? new Date(h.delivered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              {h.company ? ` · ${h.company}` : ''}
              {h.auto_detected ? <span style={{ color: '#666660' }}> · auto</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // open order → show status to everyone
  if (open) {
    return (
      <div style={{ marginTop: '14px', padding: '12px 14px', background: '#16241f', border: '0.5px solid #1f3a2f', borderRadius: '3px' }}>
        <div style={{ fontSize: '13px', color: '#2ecc71', fontWeight: 500 }}>💧 Water ordered</div>
        <div style={{ fontSize: '12px', color: '#AEAEA6', marginTop: '4px' }}>
          {open.company ? open.company : 'Delivery'}{open.expected_date ? ` · expected ${new Date(open.expected_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
        </div>
        {canEdit && <button onClick={markDelivered} style={{ marginTop: '8px', padding: '5px 12px', background: '#1f2a1a', color: '#2ecc71', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '2px' }}>Mark delivered</button>}
        <HistoryBlock />
      </div>
    )
  }

  // no open order → owner/co-owner can record one
  if (!canEdit) return null
  return (
    <div style={{ marginTop: '14px' }}>
      {!showForm ? (
        <><button onClick={() => setShowForm(true)} style={{ padding: '6px 12px', background: '#363634', color: '#AEAEA6', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '2px' }}>+ Record water order</button><HistoryBlock /></>
      ) : (
        <div style={{ padding: '12px 14px', background: '#242422', border: '0.5px solid #363634', borderRadius: '3px' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.1em', color: '#9A9A92', marginBottom: '8px' }}>Record water order</div>
          {companies.length > 0 && (
            <select value={company} onChange={e => setCompany(e.target.value)} style={{ ...inp, marginBottom: '6px' }}>
              <option value="">Select company…</option>
              {companies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <input placeholder="Or new company" value={newCompany} onChange={e => setNewCompany(e.target.value)} style={{ ...inp, marginBottom: '6px' }} />
          <input type="date" value={expected} onChange={e => setExpected(e.target.value)} title="Expected arrival" style={{ ...inp, marginBottom: '8px' }} />
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={record} disabled={saving || (!company && !newCompany.trim())} style={{ padding: '6px 14px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '2px' }}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setShowForm(false)} style={{ padding: '6px 12px', background: '#363634', color: '#9A9A92', border: 'none', fontSize: '11px', cursor: 'pointer', borderRadius: '2px' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
