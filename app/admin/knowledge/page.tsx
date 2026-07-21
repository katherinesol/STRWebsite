'use client'
import { useState, useEffect } from 'react'

const PROPERTIES = [
  { id: 'general', name: 'General (all properties)' },
  { id: 'royal-york-east', name: 'Royal York East' },
  { id: 'royal-york-west', name: 'Royal York West' },
  { id: 'nickel-beach', name: 'Nickel Beach' },
]
const TOPICS = [
  { id: 'check-in', label: 'Check-in / out' },
  { id: 'wifi', label: 'Wifi & tech' },
  { id: 'amenities', label: 'Amenities' },
  { id: 'rules', label: 'House rules' },
  { id: 'local', label: 'Local recommendations' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
  { id: 'emergency', label: 'Emergency' },
  { id: 'general', label: 'General' },
]
const topicLabel = (id: string) => TOPICS.find(t => t.id === id)?.label || id
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '13px', boxSizing: 'border-box', outline: 'none', borderRadius: '3px' }

export default function KnowledgePage() {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [propFilter, setPropFilter] = useState('royal-york-east')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ property_id: 'royal-york-east', topic: 'general', title: '', content: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importedEntries, setImportedEntries] = useState<any[]>([])

  function load() {
    fetch('/api/admin/knowledge').then(r => r.json()).then(d => { if (d.error) setError(d.error); else setEntries(d.entries || []) }).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function addEntry() {
    setError('')
    const res = await fetch('/api/admin/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const d = await res.json()
    if (d.error) { setError(d.error); return }
    setForm({ property_id: propFilter, topic: 'general', title: '', content: '' }); setShowAdd(false); load()
  }

  async function runImport() {
    setImporting(true); setError('')
    try {
      const res = await fetch('/api/admin/knowledge/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: importText }) })
      const d = await res.json()
      if (d.error) { setError(d.error); return }
      setImportedEntries((d.entries || []).map((e: any) => ({ ...e, keep: true })))
    } finally { setImporting(false) }
  }

  async function saveImported() {
    const toSave = importedEntries.filter(e => e.keep)
    for (const e of toSave) {
      await fetch('/api/admin/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ property_id: propFilter, topic: e.topic, title: e.title, content: e.content }) })
    }
    setImportedEntries([]); setImportText(''); setShowImport(false); load()
  }

  async function saveEdit(id: string) {
    await fetch(`/api/admin/knowledge/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) })
    setEditingId(null); load()
  }

  async function del(id: string) {
    if (!window.confirm('Delete this entry?')) return
    await fetch(`/api/admin/knowledge/${id}`, { method: 'DELETE' })
    load()
  }

  if (loading) return <div style={{ color: '#9A9A92' }}>Loading…</div>

  const visible = entries.filter(e => e.property_id === propFilter)
  // group by topic
  const byTopic: Record<string, any[]> = {}
  for (const e of visible) { (byTopic[e.topic] = byTopic[e.topic] || []).push(e) }

  return (
    <div style={{ maxWidth: '820px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '28px', color: '#F0EDE6' }}>Guest Knowledge Base</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowImport(s => !s)} style={{ padding: '10px 16px', background: '#363634', color: '#AEAEA6', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '3px' }}>{showImport ? 'Cancel' : '📋 Import manual'}</button>
          <button onClick={() => { setForm(f => ({ ...f, property_id: propFilter })); setShowAdd(s => !s) }} style={{ padding: '10px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '3px' }}>{showAdd ? 'Cancel' : '+ Add entry'}</button>
        </div>
      </div>
      <p style={{ fontSize: '12px', color: '#9A9A92', marginTop: 0, marginBottom: '18px' }}>Info the guest assistant will use to answer questions. Guest-facing details only — never other guests' info or operational data.</p>
      {error && <div style={{ color: '#e74c3c', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}

      {showImport && (
        <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '18px', marginBottom: '18px', borderRadius: '3px' }}>
          <div style={{ fontSize: '12px', color: '#9A9A92', marginBottom: '10px' }}>Paste your whole house manual for <strong style={{ color: '#F0EDE6' }}>{PROPERTIES.find(p => p.id === propFilter)?.name}</strong> — the assistant will split it into entries you can review.</div>
          {!importedEntries.length ? (
            <>
              <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="Paste everything — wifi, check-in, amenities, house rules, local tips…" style={{ ...inp, minHeight: '160px', resize: 'vertical', fontFamily: 'inherit' }} />
              <button onClick={runImport} disabled={importing || importText.trim().length < 20} style={{ marginTop: '10px', padding: '10px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '3px' }}>{importing ? 'Splitting…' : 'Split into entries'}</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--amber)', marginBottom: '10px' }}>Review — uncheck any you don't want, then save</div>
              {importedEntries.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', padding: '8px 0', borderBottom: '0.5px solid #2A2A28', opacity: e.keep ? 1 : 0.4 }}>
                  <input type="checkbox" checked={e.keep} onChange={() => setImportedEntries(prev => prev.map((x, xi) => xi === i ? { ...x, keep: !x.keep } : x))} style={{ marginTop: '3px' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', color: '#F0EDE6' }}>{e.title} <span style={{ fontSize: '10px', color: '#666660' }}>· {e.topic}</span></div>
                    <div style={{ fontSize: '12px', color: '#9A9A92' }}>{e.content}</div>
                  </div>
                </div>
              ))}
              <button onClick={saveImported} style={{ marginTop: '12px', padding: '10px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '3px' }}>Save {importedEntries.filter(e => e.keep).length} entries</button>
            </>
          )}
        </div>
      )}

      {/* property tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {PROPERTIES.map(p => (
          <button key={p.id} onClick={() => setPropFilter(p.id)} style={{ padding: '8px 14px', background: propFilter === p.id ? 'var(--amber)' : '#363634', color: propFilter === p.id ? '#242422' : '#AEAEA6', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '3px' }}>{p.name}</button>
        ))}
      </div>

      {/* add form */}
      {showAdd && (
        <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '18px', marginBottom: '18px', borderRadius: '3px' }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <select value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))} style={{ ...inp, width: 'auto' }}>
              {PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} style={{ ...inp, width: 'auto' }}>
              {TOPICS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <input placeholder="Title (e.g. Wifi password)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={{ ...inp, marginBottom: '10px' }} />
          <textarea placeholder="The answer the bot should give (e.g. Network: NickelBeach_Guest, Password: SunnyShores2024)" value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} style={{ ...inp, minHeight: '90px', resize: 'vertical', fontFamily: 'inherit' }} />
          <button onClick={addEntry} disabled={!form.title || !form.content} style={{ marginTop: '10px', padding: '10px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '3px' }}>Add entry</button>
        </div>
      )}

      {/* entries grouped by topic */}
      {!visible.length ? <div style={{ padding: '24px', color: '#666660', fontSize: '13px', background: '#242422', border: '0.5px solid #363634', borderRadius: '3px' }}>No entries for this property yet. Add wifi, check-in, amenities, house rules, local tips…</div> :
        TOPICS.filter(t => byTopic[t.id]?.length).map(t => (
          <div key={t.id} style={{ marginBottom: '22px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--amber)', marginBottom: '8px' }}>{t.label}</div>
            <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '3px' }}>
              {byTopic[t.id].map(e => (
                <div key={e.id} style={{ padding: '14px 16px', borderBottom: '0.5px solid #2A2A28' }}>
                  {editingId === e.id ? (
                    <div>
                      <input value={editForm.title} onChange={ev => setEditForm((f: any) => ({ ...f, title: ev.target.value }))} style={{ ...inp, marginBottom: '8px' }} />
                      <textarea value={editForm.content} onChange={ev => setEditForm((f: any) => ({ ...f, content: ev.target.value }))} style={{ ...inp, minHeight: '70px', resize: 'vertical', fontFamily: 'inherit' }} />
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button onClick={() => saveEdit(e.id)} style={{ padding: '7px 14px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '3px' }}>Save</button>
                        <button onClick={() => setEditingId(null)} style={{ padding: '7px 12px', background: '#363634', color: '#9A9A92', border: 'none', fontSize: '11px', cursor: 'pointer', borderRadius: '3px' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', color: '#F0EDE6', marginBottom: '3px' }}>{e.title}</div>
                        <div style={{ fontSize: '13px', color: '#9A9A92', whiteSpace: 'pre-wrap' }}>{e.content}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
                        <button onClick={() => { setEditingId(e.id); setEditForm({ title: e.title, content: e.content }) }} style={{ background: 'none', border: 'none', color: '#9A9A92', cursor: 'pointer', fontSize: '11px' }}>Edit</button>
                        <button onClick={() => del(e.id)} style={{ background: 'none', border: 'none', color: '#666660', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  )
}
