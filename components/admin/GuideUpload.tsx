'use client'
import { useState, useEffect } from 'react'

const PROPS = [
  { id: 'royal-york-east', name: 'Royal York East Suite' },
  { id: 'royal-york-west', name: 'Royal York West Suite' },
  { id: 'nickel-beach', name: 'Nickel Beach Retreat' },
]

export default function GuideUpload() {
  const [status, setStatus] = useState<Record<string, { exists: boolean; url: string | null }>>({})
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  function refresh(id: string) {
    fetch(`/api/admin/guest-guide?property_id=${id}`).then(r => r.json()).then(d => setStatus(s => ({ ...s, [id]: d }))).catch(() => {})
  }
  useEffect(() => { PROPS.forEach(p => refresh(p.id)) }, [])

  async function upload(id: string, file: File) {
    if (file.type !== 'application/pdf') { setMsg('Please choose a PDF'); return }
    setBusy(id); setMsg('')
    // 1. get a signed upload URL from our admin-authed API
    let sig: any
    try {
      const r = await fetch('/api/admin/guest-guide', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: id }),
      })
      sig = await r.json()
      if (!r.ok || sig.error) { setBusy(''); setMsg(`Step 1 failed (${r.status}): ${sig.error || 'no URL returned'}`); return }
    } catch (e: any) { setBusy(''); setMsg(`Step 1 error: ${e.message}`); return }
    // 2. upload the file directly to the signed URL (no 4.5MB API limit)
    try {
      const up = await fetch(sig.signedUrl, {
        method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file,
      })
      setBusy('')
      if (!up.ok) { const t = await up.text().catch(() => ''); setMsg(`Step 2 failed (${up.status}): ${t.slice(0, 140)}`); return }
    } catch (e: any) { setBusy(''); setMsg(`Step 2 error: ${e.message}`); return }
    setMsg(`Uploaded for ${id}`); refresh(id)
  }

  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '10px', padding: '20px' }}>
      <div style={{ fontSize: '13px', color: '#F0EDE6', fontWeight: 500, marginBottom: '4px' }}>House Guide PDFs</div>
      <p style={{ fontSize: '11px', color: '#9A9A92', margin: '0 0 16px' }}>Upload a guide PDF per property. Guests see it (searchable) in the hub. Re-upload to update.</p>
      {PROPS.map(p => {
        const st = status[p.id]
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderTop: '0.5px solid #363634' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', color: '#F0EDE6' }}>{p.name}</div>
              <div style={{ fontSize: '10px', color: st?.exists ? '#7bc47b' : '#888880' }}>
                {st?.exists ? '✓ guide uploaded' : 'no guide yet'}
                {st?.url && <> · <a href={st.url} target="_blank" style={{ color: '#c9a24a' }}>view</a></>}
              </div>
            </div>
            <label style={{ padding: '6px 12px', background: '#363634', color: '#c9a24a', border: '0.5px solid #4a3a1f', borderRadius: '5px', fontSize: '11px', cursor: 'pointer' }}>
              {busy === p.id ? 'Uploading…' : st?.exists ? 'Replace' : 'Upload'}
              <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) upload(p.id, f) }} />
            </label>
          </div>
        )
      })}
      {msg && <div style={{ fontSize: '11px', color: msg.includes('Uploaded') ? '#7bc47b' : '#e6a86a', marginTop: '10px' }}>{msg}</div>}
    </div>
  )
}
