'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import GuestLinkSearch from './GuestLinkSearch'

const inputStyle: React.CSSProperties = {
  width: '60%', padding: '6px 10px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
  textAlign: 'right',
}

export default function GuestEditCard({ guestId, guest, bookingId, blockId }: {
  guestId: string | null
  guest: { name?: string; email?: string; phone?: string; returning_guest?: boolean; locked_rate_enabled?: boolean } | null
  bookingId?: string
  blockId?: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    name: guest?.name ?? '',
    email: guest?.email ?? '',
    phone: guest?.phone ?? '',
    returning_guest: guest?.returning_guest ?? false,
  })

  function set(key: string, value: unknown) {
    setForm(f => ({ ...f, [key]: value }))
    setSaved(false)
  }

  async function handleSave() {
    if (!guestId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/guests/${guestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json()
        alert('Save failed: ' + (err.error || res.status))
        return
      }
      setSaved(true)
      setEditing(false)
      router.refresh()
    } catch (e) {
      alert('Network error saving guest')
    } finally {
      setSaving(false)
    }
  }

  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid #363634' }
  const labelStyle: React.CSSProperties = { fontSize: '12px', color: '#9A9A92', letterSpacing: '.04em' }
  const valueStyle: React.CSSProperties = { fontSize: '13px', color: '#F5F2EC' }

  if (!guestId) {
    return <GuestLinkSearch bookingId={bookingId} blockId={blockId} />
  }

  return (
    <div>
      {!editing ? (
        <>
          <div style={rowStyle}><span style={labelStyle}>Name</span><span style={valueStyle}>{guest?.name || '—'}</span></div>
          <div style={rowStyle}><span style={labelStyle}>Email</span><span style={valueStyle}>{guest?.email || '—'}</span></div>
          <div style={rowStyle}><span style={labelStyle}>Phone</span><span style={valueStyle}>{guest?.phone || '—'}</span></div>
          <div style={rowStyle}><span style={labelStyle}>Returning guest</span><span style={valueStyle}>{guest?.returning_guest ? 'Yes' : 'No'}</span></div>
          <div style={rowStyle}><span style={labelStyle}>Locked rate</span><span style={valueStyle}>{guest?.locked_rate_enabled ? 'Yes' : 'No'}</span></div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
            <button onClick={() => setEditing(true)}
              style={{ padding: '7px 16px', background: 'var(--amber)', color: '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 500 }}>
              Edit guest
            </button>
            <a href={`/admin/guests/${guestId}`} style={{ fontSize: '10px', color: '#9A9A92', textDecoration: 'none', letterSpacing: '.08em', textTransform: 'uppercase', alignSelf: 'center' }}>
              Full profile →
            </a>
            {saved && <span style={{ fontSize: '11px', color: '#2ecc71', alignSelf: 'center' }}>✓ Saved</span>}
          </div>
        </>
      ) : (
        <>
          <div style={rowStyle}>
            <span style={labelStyle}>Name</span>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)} style={inputStyle} />
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Email</span>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={inputStyle} />
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Phone</span>
            <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} style={inputStyle} />
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Returning guest</span>
            <button onClick={() => set('returning_guest', !form.returning_guest)}
              style={{ padding: '5px 14px', background: form.returning_guest ? 'var(--amber)' : '#363634', color: form.returning_guest ? '#1A1A18' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer' }}>
              {form.returning_guest ? 'Yes' : 'No'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button onClick={() => setEditing(false)}
              style={{ padding: '7px 16px', background: '#363634', color: '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '7px 20px', background: 'var(--amber)', color: '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 500 }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
