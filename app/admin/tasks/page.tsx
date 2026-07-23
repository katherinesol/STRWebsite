'use client'
import { useState, useEffect } from 'react'

const PROPERTIES = [
  { id: 'royal-york-east', name: 'Royal York East' },
  { id: 'royal-york-west', name: 'Royal York West' },
  { id: 'nickel-beach', name: 'Nickel Beach' },
]
const CADENCES = ['per-stay', 'weekly', 'monthly', 'annually', 'as-needed', 'one-time']
const TYPES = ['cleaning', 'maintenance']

function dueLabel(d: any) {
  if (!d) return null
  switch (d.state) {
    case 'overdue': return { text: `Overdue by ${d.days}d`, color: '#e74c3c' }
    case 'ok': return { text: `Due in ${d.days}d`, color: '#9A9A92' }
    case 'never-done': return { text: 'Never done', color: '#e67e22' }
    case 'per-stay': return { text: 'Per stay', color: '#3498db' }
    default: return null
  }
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([])
  const [role, setRole] = useState('cleaner')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [propFilter, setPropFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', property_id: '', type: 'cleaning', cadence: 'as-needed', priority: 'normal' })
  const [saving, setSaving] = useState(false)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [completeNote, setCompleteNote] = useState('')
  const [completeDate, setCompleteDate] = useState('')
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  function load() {
    fetch('/api/admin/tasks')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else { setTasks(d.tasks || []); setRole(d.role || 'cleaner'); if (d.role !== 'owner') setTypeFilter('cleaning') } })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function toggleHistory(taskId: string) {
    if (historyId === taskId) { setHistoryId(null); return }
    setHistoryId(taskId); setHistory([]); setHistoryLoading(true)
    const d = await fetch(`/api/admin/tasks/complete?task_id=${taskId}`).then(r => r.json())
    setHistory(d.history || []); setHistoryLoading(false)
  }

  async function saveEdit(taskId: string) {
    await fetch(`/api/admin/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle }),
    })
    setEditingId(null); setEditTitle(''); load()
  }

  async function confirmComplete(taskId: string) {
    await fetch('/api/admin/tasks/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, note: completeNote, completed_at: completeDate || undefined }),
    })
    setCompletingId(null); setCompleteNote(''); setCompleteDate('')
    load()
  }

  async function addTask() {
    setSaving(true); setError('')
    const res = await fetch('/api/admin/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const d = await res.json()
    setSaving(false)
    if (d.error) { setError(d.error); return }
    setForm({ title: '', description: '', property_id: '', type: 'cleaning', cadence: 'as-needed', priority: 'normal' })
    setShowAdd(false)
    load()
  }

  async function del(id: string) {
    if (!window.confirm('Delete this task?')) return
    await fetch(`/api/admin/tasks/${id}`, { method: 'DELETE' })
    load()
  }

  if (loading) return <div style={{ color: '#9A9A92' }}>Loading…</div>

  const isOwner = role === 'owner'
  const visible = tasks.filter(t => {
    if (typeFilter && t.type !== typeFilter) return false
    if (propFilter && t.property_id !== propFilter) return false
    return true
  })
  // sort: overdue first, then never-done, then by priority
  const today = new Date().toISOString().split('T')[0]
  const order = (t: any) => {
    if (t.due_date && t.due_date < today) return -1
    if (t.due_date) return 0
    return t.dueStatus?.state === 'overdue' ? 1 : t.dueStatus?.state === 'never-done' ? 2 : t.priority === 'urgent' ? 3 : 4
  }
  visible.sort((a, b) => order(a) - order(b))

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '14px', boxSizing: 'border-box', outline: 'none', borderRadius: '2px' }
  const lbl: React.CSSProperties = { fontSize: '10px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: '#AEAEA6', marginBottom: '5px' }

  return (
    <div style={{ maxWidth: '860px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '28px', color: '#F0EDE6' }}>Tasks</h1>
        <button onClick={() => { setShowAdd(s => !s); if (!isOwner) setForm(f => ({ ...f, type: 'maintenance' })) }} style={{ padding: '10px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: '2px' }}>
          {showAdd ? 'Cancel' : '+ Add task'}
        </button>
      </div>

      {error && <div style={{ color: '#e74c3c', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}

      {/* filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...inp, width: 'auto' }}>
          <option value="">All types</option>
          {TYPES.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
        </select>
        <select value={propFilter} onChange={e => setPropFilter(e.target.value)} style={{ ...inp, width: 'auto' }}>
          <option value="">All properties</option>
          {PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          {isOwner && <option value="">General</option>}
        </select>
        <span style={{ fontSize: '12px', color: '#9A9A92', alignSelf: 'center' }}>{visible.length} task{visible.length !== 1 ? 's' : ''}</span>
      </div>

      {/* add form */}
      {showAdd && (
        <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '20px', marginBottom: '20px', borderRadius: '2px' }}>
          <div style={{ marginBottom: '12px' }}><div style={lbl}>Title</div><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inp} placeholder="e.g. Replace furnace filter" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div><div style={lbl}>Property</div>
              <select value={form.property_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))} style={inp}>
                {isOwner && <option value="">General (all)</option>}
                {PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><div style={lbl}>Type</div>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} disabled={!isOwner} style={inp}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><div style={lbl}>Cadence</div>
              <select value={form.cadence} onChange={e => setForm(f => ({ ...f, cadence: e.target.value }))} style={inp}>
                {CADENCES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <button onClick={addTask} disabled={saving || !form.title} style={{ padding: '10px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: '2px' }}>
            {saving ? 'Adding…' : 'Add task'}
          </button>
        </div>
      )}

      {/* task list */}
      <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '2px' }}>
        {!visible.length ? <div style={{ padding: '24px', color: '#666660', fontSize: '13px' }}>No tasks.</div> :
          visible.map(t => {
            const due = dueLabel(t.dueStatus)
            const prop = PROPERTIES.find(p => p.id === t.property_id)
            const isCompleting = completingId === t.id
            return (
              <div key={t.id} style={{ borderBottom: '0.5px solid #2A2A28' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px' }}>
                  <button onClick={() => { setCompletingId(isCompleting ? null : t.id); setCompleteNote(''); setCompleteDate(new Date().toISOString().split('T')[0]) }} title="Mark done" style={{ padding: '7px 14px', borderRadius: '4px', border: 'none', background: isCompleting ? '#2ecc71' : '#1f2a1a', color: isCompleting ? '#1A1A18' : '#2ecc71', cursor: 'pointer', flexShrink: 0, fontSize: '12px', fontWeight: 600, letterSpacing: '.04em' }}>✓ Done</button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', color: '#F0EDE6' }}>
                      {t.title}
                      {t.priority === 'urgent' && <span style={{ color: '#e74c3c', fontSize: '10px', marginLeft: '8px', textTransform: 'uppercase', letterSpacing: '.08em' }}>Urgent</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>
                      {prop?.name || 'General'} · {t.type} · {t.cadence}
                      {t.due_date && (() => {
                        const today = new Date().toISOString().split('T')[0]
                        const overdue = t.due_date < today
                        const soon = !overdue && t.due_date <= new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
                        return <span style={{ marginLeft: '8px', color: overdue ? '#e74c3c' : soon ? '#e6a86a' : '#8A8A82' }}>
                          · due {new Date(t.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{overdue ? ' (overdue)' : ''}
                        </span>
                      })()}
                      {t.lastCompletedAt && ` · last done ${new Date(t.lastCompletedAt).toLocaleDateString()}${t.lastCompletedBy ? ` by ${t.lastCompletedBy}` : ''}`}
                    </div>
                  </div>
                  <button onClick={() => toggleHistory(t.id)} style={{ background: 'none', border: '0.5px solid #4A4A48', color: '#9A9A92', cursor: 'pointer', fontSize: '10px', padding: '4px 8px', borderRadius: '3px', whiteSpace: 'nowrap' }}>{historyId === t.id ? 'Hide log' : 'Log'}</button>
                  {due && <span style={{ fontSize: '11px', color: due.color, whiteSpace: 'nowrap' }}>{due.text}</span>}
                  {isOwner && <button onClick={() => { setEditingId(editingId === t.id ? null : t.id); setEditTitle(t.title) }} style={{ background: 'none', border: '0.5px solid #4A4A48', color: '#9A9A92', cursor: 'pointer', fontSize: '10px', padding: '4px 8px', borderRadius: '3px' }}>Edit</button>}
                  {isOwner && <button onClick={() => del(t.id)} style={{ background: 'none', border: 'none', color: '#666660', cursor: 'pointer', fontSize: '12px' }}>✕</button>}
                </div>
                {isCompleting && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '0 16px 14px 16px' }}>
                    <input type="date" value={completeDate} onChange={e => setCompleteDate(e.target.value)} title="Completion date" style={{ padding: '9px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '13px', outline: 'none', borderRadius: '4px', boxSizing: 'border-box' }} />
                    <input autoFocus value={completeNote} onChange={e => setCompleteNote(e.target.value)} placeholder="Add a note (optional)…" onKeyDown={e => { if (e.key === 'Enter') confirmComplete(t.id) }} style={{ flex: 1, padding: '9px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '13px', outline: 'none', borderRadius: '4px', boxSizing: 'border-box' }} />
                    <button onClick={() => confirmComplete(t.id)} style={{ padding: '9px 18px', background: '#2ecc71', color: '#1A1A18', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '4px' }}>Confirm</button>
                    <button onClick={() => { setCompletingId(null); setCompleteNote('') }} style={{ padding: '9px 14px', background: '#363634', color: '#9A9A92', border: 'none', fontSize: '12px', cursor: 'pointer', borderRadius: '4px' }}>Cancel</button>
                  </div>
                )}
                {editingId === t.id && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '0 16px 14px 16px' }}>
                    <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(t.id) }} style={{ flex: 1, padding: '9px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '13px', outline: 'none', borderRadius: '4px', boxSizing: 'border-box' }} />
                    <button onClick={() => saveEdit(t.id)} style={{ padding: '9px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '4px' }}>Save</button>
                    <button onClick={() => { setEditingId(null); setEditTitle('') }} style={{ padding: '9px 14px', background: '#363634', color: '#9A9A92', border: 'none', fontSize: '12px', cursor: 'pointer', borderRadius: '4px' }}>Cancel</button>
                  </div>
                )}
                {historyId === t.id && (
                  <div style={{ padding: '0 16px 14px 16px' }}>
                    <div style={{ background: '#1A1A18', border: '0.5px solid #363634', borderRadius: '4px', padding: '10px 14px' }}>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.1em', color: '#B8956B', marginBottom: '8px' }}>Completion log</div>
                      {historyLoading ? <div style={{ fontSize: '12px', color: '#666660' }}>Loading…</div> :
                        !history.length ? <div style={{ fontSize: '12px', color: '#666660' }}>No completions yet.</div> :
                        history.map((h, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '5px 0', borderBottom: i < history.length - 1 ? '0.5px solid #2A2A28' : 'none', fontSize: '12px' }}>
                            <span style={{ color: '#F0EDE6' }}>{new Date(h.at).toLocaleDateString()}{h.by ? ` · ${h.by}` : ''}</span>
                            {h.note && <span style={{ color: '#9A9A92', fontStyle: 'italic', textAlign: 'right' }}>{h.note}</span>}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}
