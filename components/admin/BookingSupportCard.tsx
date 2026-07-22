'use client'
import { useState } from 'react'

export default function BookingSupportCard({ bookingId, source, initialCode, siteUrl }: { bookingId: string; source: 'direct' | 'platform'; initialCode: string | null; siteUrl: string }) {
  const [code, setCode] = useState(initialCode || '')
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(initialCode || '')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState('')

  const supportUrl = `${siteUrl}/support`

  async function save() {
    setSaving(true)
    await fetch('/api/admin/bookings/set-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: bookingId, source, code: val.trim() }) })
    setCode(val.trim()); setEditing(false); setSaving(false)
  }
  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(''), 1500)
  }

  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', marginBottom: '16px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>Guest Support Access</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid #363634' }}>
        <span style={{ fontSize: '12px', color: '#9A9A92' }}>Confirmation code</span>
        {editing ? (
          <span style={{ display: 'flex', gap: '6px' }}>
            <input value={val} onChange={e => setVal(e.target.value)} placeholder="Enter code" style={{ padding: '5px 8px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '13px', borderRadius: '3px' }} />
            <button onClick={save} disabled={saving} style={{ padding: '5px 10px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '3px' }}>{saving ? '…' : 'Save'}</button>
          </span>
        ) : (
          <span style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', color: '#F0EDE6', letterSpacing: '.05em', fontFamily: 'monospace' }}>{code || '— none —'}</span>
            {code && <button onClick={() => copy(code, 'code')} style={{ fontSize: '10px', color: '#9A9A92', background: 'none', border: 'none', cursor: 'pointer' }}>{copied === 'code' ? '✓' : 'copy'}</button>}
            <button onClick={() => { setVal(code); setEditing(true) }} style={{ fontSize: '10px', color: '#9A9A92', background: 'none', border: 'none', cursor: 'pointer' }}>edit</button>
          </span>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
        <span style={{ fontSize: '12px', color: '#9A9A92' }}>Support link</span>
        <span style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#AEAEA6' }}>{supportUrl}</span>
          <button onClick={() => copy(supportUrl, 'link')} style={{ fontSize: '10px', color: '#9A9A92', background: 'none', border: 'none', cursor: 'pointer' }}>{copied === 'link' ? '✓' : 'copy'}</button>
        </span>
      </div>
      <div style={{ fontSize: '11px', color: '#666660', marginTop: '10px', lineHeight: 1.5 }}>
        Share the link and code with your guest. They enter the code + their last name at the support page to chat with the AI about their stay.
      </div>
    </div>
  )
}
