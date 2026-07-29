'use client'
import { useState, useEffect } from 'react'

export default function StaffAccessPage() {
  const [grants, setGrants] = useState<any[]>([])
  const [locks, setLocks] = useState<any[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState<any>({ person_name: '', role: '', code: '', access_type: 'ongoing', starts_at: '', ends_at: '', lock_ids: [] as string[] })

  function load() {
    Promise.all([
      fetch('/api/admin/staff-access').then(r => r.json()),
      fetch('/api/admin/locks/list').then(r => r.json()),
      fetch('/api/admin/invoices/vendors').then(r => r.json()).catch(() => ({})),
    ]).then(([g, l, v]) => {
      setGrants(g.grants || []); setLocks(l.locks || [])
      const names = (v.contractors || v.vendors || []).map((x: any) => x.contractor_name || x.company || x).filter(Boolean)
      setSuggestions([...new Set<string>(names)])
    }).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  function toggleLock(id: string) {
    setForm((f: any) => ({ ...f, lock_ids: f.lock_ids.includes(id) ? f.lock_ids.filter((x: string) => x !== id) : [...f.lock_ids, id] }))
  }

  async function grant() {
    setMsg('')
    if (!form.person_name || !/^\d{4}$/.test(form.code) || !form.lock_ids.length) { setMsg('Need a name, 4-digit code, and at least one door'); return }
    if (form.access_type === 'fixed' && (!form.starts_at || !form.ends_at)) { setMsg('Fixed access needs start and end'); return }
    setSaving(true)
    const body: any = { ...form }
    if (form.access_type === 'fixed') { body.starts_at = new Date(form.starts_at).toISOString(); body.ends_at = new Date(form.ends_at).toISOString() }
    const r = await fetch('/api/admin/staff-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json())
    setSaving(false)
    if (r.error) { setMsg(r.error); return }
    setForm({ person_name: '', role: '', code: '', access_type: 'ongoing', starts_at: '', ends_at: '', lock_ids: [] })
    setShowForm(false); load()
  }

  async function revoke(id: string, name: string) {
    if (!window.confirm(`Revoke ${name}'s access? This removes their code from the locks.`)) return
    await fetch('/api/admin/staff-access', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    load()
  }

  const lockName = (id: string) => locks.find(l => l.seam_device_id === id)?.lock_name || id
  const inp: React.CSSProperties = { padding: '9px 12px', background: '#1E1E1C', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '13px', borderRadius: '4px', boxSizing: 'border-box' }

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '18px' }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '30px', color: '#F0EDE6', margin: 0 }}>Staff & Contractor Access</h1>
        {!showForm && <button onClick={() => setShowForm(true)} style={{ padding: '9px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '6px' }}>+ Grant access</button>}
      </div>

      {showForm && (
        <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <input list="contractor-suggestions" placeholder="Name — pick a contractor or type" value={form.person_name} onChange={e => setForm((f: any) => ({ ...f, person_name: e.target.value }))} style={inp} />
            <datalist id="contractor-suggestions">
              {suggestions.map((n, i) => <option key={i} value={n} />)}
            </datalist>
            <input placeholder="Role (optional)" value={form.role} onChange={e => setForm((f: any) => ({ ...f, role: e.target.value }))} style={inp} />
            <input placeholder="4-digit code" maxLength={4} value={form.code} onChange={e => setForm((f: any) => ({ ...f, code: e.target.value.replace(/\D/g, '').slice(0, 4) }))} style={{ ...inp, fontFamily: 'monospace' }} />
            <select value={form.access_type} onChange={e => setForm((f: any) => ({ ...f, access_type: e.target.value }))} style={inp}>
              <option value="ongoing">Ongoing (until revoked)</option>
              <option value="fixed">Fixed window</option>
            </select>
          </div>

          {form.access_type === 'fixed' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: '#9A9A92' }}>Starts<input type="datetime-local" value={form.starts_at} onChange={e => setForm((f: any) => ({ ...f, starts_at: e.target.value }))} style={{ ...inp, width: '100%', marginTop: '3px' }} /></label>
              <label style={{ fontSize: '11px', color: '#9A9A92' }}>Ends<input type="datetime-local" value={form.ends_at} onChange={e => setForm((f: any) => ({ ...f, ends_at: e.target.value }))} style={{ ...inp, width: '100%', marginTop: '3px' }} /></label>
            </div>
          )}

          <div style={{ fontSize: '11px', color: '#9A9A92', marginBottom: '8px' }}>Which doors?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
            {locks.map(l => (
              <button key={l.seam_device_id} onClick={() => toggleLock(l.seam_device_id)}
                style={{ padding: '7px 14px', borderRadius: '6px', border: '0.5px solid ' + (form.lock_ids.includes(l.seam_device_id) ? 'var(--amber)' : '#4A4A48'), background: form.lock_ids.includes(l.seam_device_id) ? 'var(--amber)' : '#1E1E1C', color: form.lock_ids.includes(l.seam_device_id) ? '#242422' : '#AEAEA6', fontSize: '12px', cursor: 'pointer' }}>
                {l.lock_name}
              </button>
            ))}
          </div>

          {msg && <div style={{ fontSize: '12px', color: '#e6a86a', marginBottom: '10px' }}>{msg}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={grant} disabled={saving} style={{ padding: '9px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '6px' }}>{saving ? 'Granting…' : 'Grant access'}</button>
            <button onClick={() => { setShowForm(false); setMsg('') }} style={{ padding: '9px 16px', background: '#363634', color: '#9A9A92', border: 'none', fontSize: '12px', cursor: 'pointer', borderRadius: '6px' }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? <div style={{ color: '#666660', fontSize: '13px' }}>Loading…</div> : (
        <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '8px', overflow: 'hidden' }}>
          {grants.length === 0 && <div style={{ padding: '18px', fontSize: '13px', color: '#666660' }}>No one has standing access yet.</div>}
          {grants.map(g => (
            <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderTop: '0.5px solid #2A2A28' }}>
              <div>
                <div style={{ fontSize: '14px', color: '#F0EDE6' }}>{g.person_name} <span style={{ fontFamily: 'monospace', color: 'var(--amber)', marginLeft: '6px' }}>{g.code}</span></div>
                <div style={{ fontSize: '11px', color: '#8A8A82', marginTop: '3px' }}>
                  {g.role ? g.role + ' · ' : ''}{(g.lock_ids || []).map(lockName).join(', ')} · {g.access_type === 'fixed' ? `${new Date(g.starts_at).toLocaleDateString()}–${new Date(g.ends_at).toLocaleDateString()}` : 'ongoing'}
                </div>
              </div>
              <button onClick={() => revoke(g.id, g.person_name)} style={{ background: 'none', border: '0.5px solid #4A4A48', color: '#c47b7b', fontSize: '11px', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer' }}>Revoke</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
