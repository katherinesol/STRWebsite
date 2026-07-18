'use client'
import { useState, useEffect } from 'react'

const ROLES = ['owner', 'co-owner', 'cleaner']

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [denied, setDenied] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cleaner' })
  const [saving, setSaving] = useState(false)
  const [assignments, setAssignments] = useState<any[]>([])
  const [asgUser, setAsgUser] = useState('')
  const [asgProp, setAsgProp] = useState('')

  function load() {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => { if (d.error) { setError(d.error); setDenied(true) } else setUsers(d.users || []) })
      .finally(() => setLoading(false))
    fetch('/api/admin/assignments').then(r => r.json()).then(d => { if (d.assignments) setAssignments(d.assignments) })
  }
  useEffect(() => { load() }, [])

  async function addAssignment() {
    if (!asgUser || !asgProp) return
    const res = await fetch('/api/admin/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: asgUser, property_id: asgProp }) })
    const d = await res.json()
    if (d.error) { setError(d.error); return }
    setAsgUser(''); setAsgProp(''); load()
  }
  async function removeAssignment(id: string) {
    await fetch(`/api/admin/assignments?id=${id}`, { method: 'DELETE' })
    load()
  }
  const PROPS = [
    { id: 'royal-york-east', name: 'Royal York East' },
    { id: 'royal-york-west', name: 'Royal York West' },
    { id: 'nickel-beach', name: 'Nickel Beach' },
  ]

  async function addUser() {
    setSaving(true); setError('')
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const d = await res.json()
    setSaving(false)
    if (d.error) { setError(d.error); return }
    setForm({ name: '', email: '', password: '', role: 'cleaner' })
    setShowAdd(false)
    load()
  }

  async function changeRole(id: string, role: string) {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, role }),
    })
    const d = await res.json()
    if (d.error) { setError(d.error); return }
    load()
  }

  async function toggleActive(id: string, active: boolean) {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active }),
    })
    const d = await res.json()
    if (d.error) { setError(d.error); return }
    load()
  }

  if (loading) return <div style={{ color: '#9A9A92' }}>Loading…</div>
  if (denied) return <div style={{ color: '#e74c3c' }}>You don't have access to this page.</div>

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '14px', boxSizing: 'border-box', outline: 'none', borderRadius: '2px' }
  const lbl: React.CSSProperties = { fontSize: '10px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: '#AEAEA6', marginBottom: '5px' }

  return (
    <div style={{ maxWidth: '760px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '28px', color: '#F0EDE6' }}>Team & Access</h1>
        <button onClick={() => setShowAdd(s => !s)} style={{ padding: '10px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: '2px' }}>
          {showAdd ? 'Cancel' : '+ Add person'}
        </button>
      </div>

      {error && <div style={{ color: '#e74c3c', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}

      {showAdd && (
        <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '20px', marginBottom: '20px', borderRadius: '2px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div><div style={lbl}>Name</div><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} /></div>
            <div><div style={lbl}>Email</div><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inp} /></div>
            <div><div style={lbl}>Temporary password</div><input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="min 8 characters" style={inp} /></div>
            <div><div style={lbl}>Role</div>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inp}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#9A9A92', marginBottom: '12px' }}>
            They log in with this email + password. Owner sees everything; cleaner sees cleaning tasks only.
          </div>
          <button onClick={addUser} disabled={saving} style={{ padding: '10px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: '2px' }}>
            {saving ? 'Creating…' : 'Create account'}
          </button>
        </div>
      )}

      <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '2px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 110px', padding: '12px 16px', borderBottom: '0.5px solid #363634', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.08em', color: '#9A9A92' }}>
          <span>Name</span><span>Email</span><span>Role</span><span>Status</span>
        </div>
        {users.map(u => (
          <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 110px', padding: '14px 16px', borderBottom: '0.5px solid #2A2A28', fontSize: '13px', alignItems: 'center', opacity: u.active ? 1 : 0.5 }}>
            <span style={{ color: '#F0EDE6' }}>{u.name}</span>
            <span style={{ color: '#9A9A92', fontSize: '12px' }}>{u.email}</span>
            <select value={u.role} onChange={e => changeRole(u.id, e.target.value)} style={{ ...inp, padding: '5px 8px', fontSize: '12px', width: 'auto' }}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={() => toggleActive(u.id, !u.active)} style={{ padding: '5px 10px', background: u.active ? '#2a1518' : '#1f2a1a', color: u.active ? '#e74c3c' : '#2ecc71', border: 'none', fontSize: '11px', cursor: 'pointer', borderRadius: '2px', width: 'fit-content' }}>
              {u.active ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        ))}
      </div>

      <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '22px', color: '#F0EDE6', marginTop: '36px', marginBottom: '14px' }}>Property Assignments</h2>
      <p style={{ fontSize: '12px', color: '#9A9A92', marginTop: 0, marginBottom: '14px' }}>Cleaners only see tasks for properties they're assigned to.</p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <select value={asgUser} onChange={e => setAsgUser(e.target.value)} style={{ ...inp, width: 'auto' }}>
          <option value="">Select person…</option>
          {users.filter(u => u.role === 'cleaner' && u.active).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={asgProp} onChange={e => setAsgProp(e.target.value)} style={{ ...inp, width: 'auto' }}>
          <option value="">Select property…</option>
          {PROPS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={addAssignment} disabled={!asgUser || !asgProp} style={{ padding: '8px 16px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '2px' }}>Assign</button>
      </div>
      <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '2px' }}>
        {!assignments.length ? <div style={{ padding: '16px', color: '#666660', fontSize: '13px' }}>No assignments yet.</div> :
          assignments.map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '0.5px solid #2A2A28', fontSize: '13px' }}>
              <span style={{ color: '#F0EDE6' }}>{(a.profiles as any)?.name || 'Unknown'} <span style={{ color: '#666660' }}>→</span> {PROPS.find(p => p.id === a.property_id)?.name || a.property_id}</span>
              <button onClick={() => removeAssignment(a.id)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
            </div>
          ))}
      </div>
    </div>
  )
}
