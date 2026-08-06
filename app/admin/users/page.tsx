'use client'
import { useState, useEffect } from 'react'

const ROLES = ['owner', 'co-owner', 'cleaner']

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [viewerIsSuper, setViewerIsSuper] = useState(false)
  const [permOpen, setPermOpen] = useState<string | null>(null)
  const [permDraft, setPermDraft] = useState<any>({})
  const [permSaving, setPermSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [denied, setDenied] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'cleaner' })
  const [saving, setSaving] = useState(false)
  const [editNameId, setEditNameId] = useState<string | null>(null)
  const [nameVal, setNameVal] = useState('')
  const [assignments, setAssignments] = useState<any[]>([])
  const [asgUser, setAsgUser] = useState('')
  const [asgProp, setAsgProp] = useState('')

  function load() {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => { if (d.error) { setError(d.error); setDenied(true) } else { setUsers(d.users || []); setViewerIsSuper(!!d.viewerIsSuper) } })
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

  const PERM_CATS = [
    { key: 'bookings', label: 'Bookings' },
    { key: 'money', label: 'Money & Tax' },
    { key: 'locks', label: 'Locks & Access' },
    { key: 'guests', label: 'Guests' },
    { key: 'damage', label: 'Damage' },
    { key: 'property', label: 'Property' },
  ]
  function openPerms(u: any) {
    if (permOpen === u.id) { setPermOpen(null); return }
    const base: any = { calendar: {}, ...(u.permissions || {}) }
    for (const cat of PERM_CATS) if (!base[cat.key]) base[cat.key] = 'none'
    if (!base.calendar) base.calendar = {}
    setPermDraft(base)
    setPermOpen(u.id)
  }
  async function savePermissions(id: string) {
    setPermSaving(true)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, permissions: permDraft }),
    })
    const d = await res.json()
    setPermSaving(false)
    if (d.error) { setError(d.error); return }
    setPermOpen(null); load()
  }
  async function addUser() {
    setSaving(true); setError('')
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const d = await res.json()
    setSaving(false)
    if (d.error) { setError(d.error); return }
    setForm({ name: '', email: '', role: 'cleaner' })
    setShowAdd(false)
    load()
  }

  async function saveName(id: string) {
    await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name: nameVal }) })
    setEditNameId(null); load()
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
            <div><div style={lbl}>Role</div>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inp}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#9A9A92', marginBottom: '12px' }}>
            They'll get an email invite to set their own password. You control what they can access with the Permissions button after they're added.
          </div>
          <button onClick={addUser} disabled={saving} style={{ padding: '10px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: '2px' }}>
            {saving ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      )}

      <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '2px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 110px', padding: '12px 16px', borderBottom: '0.5px solid #363634', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.08em', color: '#9A9A92' }}>
          <span>Name</span><span>Email</span><span>Role</span><span>Status</span>
        </div>
        {users.map(u => (
          <div key={u.id}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px 110px', padding: '14px 16px', borderBottom: permOpen === u.id ? 'none' : '0.5px solid #2A2A28', fontSize: '13px', alignItems: 'center', opacity: u.active ? 1 : 0.5 }}>
            {editNameId === u.id ? (
              <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveName(u.id); if (e.key === 'Escape') setEditNameId(null) }} onBlur={() => saveName(u.id)} style={{ ...inp, padding: '4px 8px', fontSize: '13px', width: '90%' }} />
            ) : (
              <span onClick={() => { setEditNameId(u.id); setNameVal(u.name) }} style={{ color: '#F0EDE6', cursor: 'pointer' }} title="Click to edit">{u.name}</span>
            )}
            <span style={{ color: '#9A9A92', fontSize: '12px' }}>{u.email}</span>
            <select value={u.role} onChange={e => changeRole(u.id, e.target.value)} style={{ ...inp, padding: '5px 8px', fontSize: '12px', width: 'auto' }}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div style={{ display: 'flex', gap: '6px', flexDirection: 'column', alignItems: 'flex-start' }}>
              <button onClick={() => toggleActive(u.id, !u.active)} style={{ padding: '5px 10px', background: u.active ? '#2a1518' : '#1f2a1a', color: u.active ? '#e74c3c' : '#2ecc71', border: 'none', fontSize: '11px', cursor: 'pointer', borderRadius: '2px', width: 'fit-content' }}>
                {u.active ? 'Deactivate' : 'Reactivate'}
              </button>
              {viewerIsSuper && u.role !== 'owner' && (
                <button onClick={() => openPerms(u)} style={{ padding: '4px 9px', background: '#242422', color: '#c9a24a', border: '0.5px solid #4a3a1f', fontSize: '10px', cursor: 'pointer', borderRadius: '2px' }}>
                  {permOpen === u.id ? 'Close' : 'Permissions'}
                </button>
              )}
            </div>
          </div>
          {viewerIsSuper && permOpen === u.id && (
            <div style={{ padding: '14px 20px 18px', borderBottom: '0.5px solid #2A2A28', background: '#1E1E1C' }}>
              <div style={{ fontSize: '11px', color: '#9A9A92', marginBottom: '10px' }}>What {u.name} can access:</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                {PERM_CATS.map(cat => (
                  <div key={cat.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#F0EDE6' }}>{cat.label}</span>
                    <select value={permDraft[cat.key] || 'none'} onChange={e => setPermDraft((d: any) => ({ ...d, [cat.key]: e.target.value }))}
                      style={{ ...inp, padding: '4px 8px', fontSize: '11px', width: 'auto' }}>
                      <option value="none">None</option>
                      <option value="view">View only</option>
                      <option value="edit">View + edit</option>
                    </select>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '11px', color: '#9A9A92', marginBottom: '8px', paddingTop: '8px', borderTop: '0.5px solid #2A2A28' }}>Calendar</div>
              <div style={{ display: 'flex', gap: '18px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#F0EDE6', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!permDraft.calendar?.addBlocks} onChange={e => setPermDraft((d: any) => ({ ...d, calendar: { ...d.calendar, addBlocks: e.target.checked } }))} />
                  Can add blocks
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#F0EDE6', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!permDraft.calendar?.deleteOwn} onChange={e => setPermDraft((d: any) => ({ ...d, calendar: { ...d.calendar, deleteOwn: e.target.checked } }))} />
                  Can delete own blocks (not others')
                </label>
              </div>
              <button onClick={() => savePermissions(u.id)} disabled={permSaving} style={{ padding: '8px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '4px' }}>
                {permSaving ? 'Saving…' : 'Save permissions'}
              </button>
            </div>
          )}
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
