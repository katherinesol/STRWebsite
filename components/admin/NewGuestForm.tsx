'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

export default function NewGuestForm() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Save failed')
        return
      }
      router.push(`/admin/guests/${data.guest.id}`)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', maxWidth: '480px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Full name *</div>
          <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} autoFocus />
        </div>
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Email</div>
          <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Phone</div>
          <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inputStyle} />
        </div>
      </div>
      {error && <div style={{ fontSize: '12px', color: '#e74c3c', marginTop: '12px' }}>{error}</div>}
      <button onClick={handleSave} disabled={!form.name.trim() || saving}
        style={{ marginTop: '20px', padding: '10px 24px', background: form.name.trim() ? 'var(--amber)' : '#363634', color: form.name.trim() ? '#1A1A18' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 500 }}>
        {saving ? 'Creating...' : 'Create guest'}
      </button>
    </div>
  )
}
