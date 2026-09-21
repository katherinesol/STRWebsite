'use client'
import { useState, useEffect } from 'react'
import { L, F, microLabel, cardStyle } from '@/lib/design-tokens'

/*  Orphaned for three weeks, and nobody noticed.
 *
 *  This component was mounted on /admin/properties. That page was redirected to
 *  /keyholder/property in the commit that built the new editor — and the editor
 *  shipped with Content, Places, Photos and Pricing, no Guides tab. So the only
 *  way to upload a house guide stopped existing, while the four API routes
 *  behind it stayed perfectly alive. A capability-by-routes-called audit called
 *  that page covered, because the routes WERE reachable; nothing rendered them.
 *
 *  It bit twice. The missing guides for Nickel Beach and Royal York West were
 *  already on the list as content Katherine owed, and the escalation analysis
 *  had just argued those guides would pre-empt most guest questions — four of
 *  the six escalations ever raised were answerable from guide material. The tool
 *  to write them had been redirected away.
 *
 *  SCOPED, AND RESTYLED IN PLACE. It takes a property now, because it lives
 *  inside one property's editor; with none it still lists all three, which is
 *  what it always did. The dark palette went with the page it used to sit on, so
 *  it moves onto the keyholder tokens rather than being forked — same call as
 *  PhotoManager, and for the same reason: after this it has exactly one caller,
 *  and a second copy is two things to fix when an upload breaks. */

const PROPS = [
  { id: 'royal-york-east', name: 'Royal York East Suite' },
  { id: 'royal-york-west', name: 'Royal York West Suite' },
  { id: 'nickel-beach', name: 'Nickel Beach Retreat' },
]

export default function GuideUpload({ propertyId, propertyName }: {
  propertyId?: string
  propertyName?: string
} = {}) {
  const only = propertyId ? [{ id: propertyId, name: propertyName || propertyId }] : PROPS
  const [status, setStatus] = useState<Record<string, { exists: boolean; url: string | null }>>({})
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  function refresh(id: string) {
    fetch(`/api/admin/guest-guide?property_id=${id}`).then(r => r.json()).then(d => setStatus(s => ({ ...s, [id]: d }))).catch(() => {})
  }
  useEffect(() => { only.forEach(p => refresh(p.id)) }, [propertyId])

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
    <div style={{ ...cardStyle, padding: '22px 24px' }}>
      <div style={{ ...microLabel, marginBottom: '6px' }}>House guide</div>
      <p style={{ fontSize: '13.5px', color: L.inkBody, margin: '0 0 16px', lineHeight: 1.55, maxWidth: '560px' }}>
        One PDF. Guests read it in the hub, and it is searchable there — so the things they
        would otherwise message about, like how the shower works or where the hot-tub key is,
        are answerable without you. Re-upload to replace it.
      </p>
      {only.map(p => {
        const st = status[p.id]
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 0', borderTop: `1px solid ${L.lineFaint}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: L.ink }}>{p.name}</div>
              <div style={{ fontSize: '13px', color: st?.exists ? L.green : L.inkMuted, marginTop: '2px' }}>
                {st === undefined ? 'checking…' : st.exists ? 'A guide is uploaded' : 'No guide yet — guests see an empty card'}
                {st?.url && <> · <a href={st.url} target="_blank" rel="noreferrer" style={{ color: L.link, fontWeight: 600 }}>view it</a></>}
              </div>
            </div>
            <label style={{
              padding: '9px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13.5px', fontWeight: 600,
              background: st?.exists ? L.card : L.ink, color: st?.exists ? L.inkBody : L.onInk,
              border: `1px solid ${st?.exists ? L.line : L.ink}`,
            }}>
              {busy === p.id ? 'Uploading…' : st?.exists ? 'Replace' : 'Upload a PDF'}
              <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) upload(p.id, f) }} />
            </label>
          </div>
        )
      })}
      {msg && <div style={{ fontSize: '13px', color: msg.includes('Uploaded') ? L.green : L.red, marginTop: '12px' }}>{msg}</div>}
    </div>
  )
}
