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
    const fd = new FormData()
    fd.append('property_id', id); fd.append('file', file)
    const d = await fetch('/api/admin/guest-guide', { method: 'POST', body: fd }).then(r => r.json()).catch(() => ({ error: 'upload failed' }))
    setBusy('')
    if (d.error) { setMsg(d.error); return }
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
