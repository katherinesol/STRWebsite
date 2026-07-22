'use client'
import { useState, useRef, useEffect } from 'react'

const SUGGESTIONS = [
  "What check-ins are coming up?",
  "Who's staying at Nickel Beach right now?",
  "What tasks are open?",
  "How much have I spent this month?",
]

export default function HaussyPage() {
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingImages, setPendingImages] = useState<any[]>([])
  const [extracting, setExtracting] = useState(false)
  const [draftBooking, setDraftBooking] = useState<any>(null)
  const [overlaps, setOverlaps] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])

  async function send(text?: string) {
    const q = (text ?? input).trim()
    if (!q || busy) return
    const newMessages = [...messages, { role: 'user', content: q }]
    setMessages(newMessages); setInput(''); setBusy(true)
    try {
      const res = await fetch('/api/admin/haussy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages.map(m => ({ role: m.role, content: m.content })) }),
      })
      const d = await res.json()
      if (d.error) setMessages(m => [...m, { role: 'assistant', content: `⚠️ ${d.error}` }])
      else setMessages(m => [...m, { role: 'assistant', content: d.answer || '(no response)', tools: d.tools }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: '⚠️ Something went wrong.' }])
    } finally { setBusy(false) }
  }

  function fileToImg(file: File): Promise<any> {
    return new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res({ data: String(r.result).split(',')[1], mediaType: file.type || 'image/jpeg' })
      r.onerror = rej
      r.readAsDataURL(file)
    })
  }
  async function addFiles(files: FileList | null) {
    if (!files?.length) return
    const imgs = await Promise.all(Array.from(files).map(fileToImg))
    setPendingImages(prev => [...prev, ...imgs])
  }
  function onPaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/'))
    if (items.length) {
      e.preventDefault()
      Promise.all(items.map(i => fileToImg(i.getAsFile()!))).then(imgs => setPendingImages(prev => [...prev, ...imgs]))
    }
  }
  async function extractBooking() {
    if (!pendingImages.length) return
    setExtracting(true); setDraftBooking(null); setOverlaps([])
    try {
      const res = await fetch('/api/admin/haussy/extract-booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images: pendingImages }) })
      const d = await res.json()
      if (d.error) { setSavedMsg(d.error); return }
      setDraftBooking({ ...d.extracted, property_id: d.extracted.property_id || '' })
      setPendingImages([])
    } finally { setExtracting(false) }
  }
  async function checkAndSave(commit: boolean, updateId?: string) {
    if (!draftBooking?.property_id) { setSavedMsg('Pick a property first'); return }
    setSaving(true)
    const body: any = { booking: draftBooking, check: !commit }
    if (updateId) body.update_id = updateId
    const res = await fetch('/api/admin/haussy/create-booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json()
    setSaving(false)
    if (d.error) { setSavedMsg(d.error); return }
    if (!commit) { setOverlaps(d.overlaps || []); if (!d.overlaps?.length) checkAndSave(true); return }
    setSavedMsg(d.merged ? `✓ Existing booking updated${d.guest_id ? ' + guest linked' : ''}` : `✓ Booking saved${d.guest_id ? ' + guest linked' : ''}`)
    setDraftBooking(null); setOverlaps([])
  }
  const bset = (patch: any) => setDraftBooking((p: any) => ({ ...p, ...patch }))
  function shiftYear(year: string) {
    setDraftBooking((p: any) => {
      const fix = (d: string) => d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${year}${d.slice(4)}` : d
      return { ...p, check_in: fix(p.check_in), check_out: fix(p.check_out) }
    })
  }
  const thisYear = new Date().getFullYear()

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
      <div style={{ marginBottom: '4px' }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '30px', color: '#F0EDE6', margin: 0 }}>Haussy</h1>
        <p style={{ fontSize: '12px', color: '#9A9A92', marginTop: '2px' }}>Your private business assistant. Reads your data — never changes it.</p>
      </div>

      {/* conversation */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {!messages.length && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', color: '#666660', marginBottom: '12px' }}>Try asking</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)} style={{ textAlign: 'left', padding: '12px 16px', background: '#242422', border: '0.5px solid #363634', color: '#AEAEA6', fontSize: '14px', cursor: 'pointer', borderRadius: '8px' }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <div style={{ padding: '11px 15px', borderRadius: '12px', fontSize: '14px', lineHeight: 1.55, whiteSpace: 'pre-wrap',
              background: m.role === 'user' ? 'var(--amber)' : '#242422',
              color: m.role === 'user' ? '#242422' : '#F0EDE6',
              border: m.role === 'user' ? 'none' : '0.5px solid #363634',
              borderBottomRightRadius: m.role === 'user' ? '3px' : '12px',
              borderBottomLeftRadius: m.role === 'user' ? '12px' : '3px' }}>
              {m.content}
            </div>
            {m.tools?.length > 0 && (
              <div style={{ fontSize: '9px', color: '#555550', marginTop: '4px', paddingLeft: '4px' }}>
                {m.tools.map((t: any) => t.tool).join(' · ')}
              </div>
            )}
          </div>
        ))}
        {busy && <div style={{ alignSelf: 'flex-start', fontSize: '13px', color: '#9A9A92', padding: '8px 4px' }}>Haussy is thinking…</div>}
        <div ref={endRef} />
      </div>

      {/* booking draft confirmation card */}
      {draftBooking && (
        <div style={{ background: '#242422', border: '0.5px solid #4a3f1f', borderRadius: '8px', padding: '16px', marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--amber)', marginBottom: '12px' }}>Review booking — nothing saves until you confirm</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
            <select value={draftBooking.property_id} onChange={e => bset({ property_id: e.target.value })} style={{ gridColumn: '1 / -1', padding: '8px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F0EDE6', borderRadius: '3px' }}>
              <option value="">Select property…</option>
              <option value="royal-york-east">Royal York East</option>
              <option value="royal-york-west">Royal York West</option>
              <option value="nickel-beach">Nickel Beach</option>
            </select>
            <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '9px', color: '#9A9A92', textTransform: 'uppercase' }}>Booking year</span>
              <select value={(draftBooking.check_in || '').slice(0,4) || String(thisYear)} onChange={e => shiftYear(e.target.value)} style={{ padding: '6px 8px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '12px', borderRadius: '3px' }}>
                {[thisYear, thisYear + 1, thisYear + 2].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <span style={{ fontSize: '10px', color: '#666660' }}>adjusts both dates</span>
            </label>
            {[['guest_name','Guest'],['platform','Platform'],['confirmation_code','Confirmation code'],['check_in','Check-in'],['check_out','Check-out'],['check_in_time','Check-in time'],['check_out_time','Checkout time'],['door_code','Door code'],['guest_email','Email'],['guest_phone','Phone'],['nightly_rate','Nightly'],['accommodation','Accommodation'],['cleaning_fee','Cleaning'],['discount','Discount'],['occupancy_taxes','Occupancy taxes'],['guest_total','Guest total'],['payout_amount','Payout']].map(([k,label]) => (
              <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '9px', color: '#9A9A92', textTransform: 'uppercase' }}>{label}</span>
                <input value={draftBooking[k] ?? ''} onChange={e => bset({ [k]: e.target.value })} style={{ padding: '6px 8px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '12px', borderRadius: '3px' }} />
              </label>
            ))}
          </div>
          {overlaps.length > 0 ? (
            <div style={{ marginTop: '10px' }}>
              <div style={{ padding: '10px', background: '#2a2416', border: '0.5px solid #4a3f1f', borderRadius: '4px', fontSize: '12px', color: '#e6c88a', marginBottom: '10px' }}>
                This overlaps {overlaps.length} existing booking(s): {overlaps.map((o: any) => `${o.guest_name || o.platform || o.source} (${o.start_date || o.check_in})`).join(', ')}.
                {overlaps.some((o: any) => o.source === 'platform') ? ' Likely the same booking already imported from the calendar — updating fills in the guest, pricing, and door code.' : ''}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {overlaps.filter((o: any) => o.source === 'platform').map((o: any) => (
                  <button key={o.id} onClick={() => checkAndSave(true, o.id)} disabled={saving} style={{ padding: '9px 16px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '6px' }}>Update existing booking</button>
                ))}
                <button onClick={() => checkAndSave(true)} disabled={saving} style={{ padding: '9px 16px', background: '#363634', color: '#AEAEA6', border: 'none', fontSize: '12px', cursor: 'pointer', borderRadius: '6px' }}>Create separate</button>
                <button onClick={() => { setDraftBooking(null); setOverlaps([]) }} style={{ padding: '9px 16px', background: '#363634', color: '#9A9A92', border: 'none', fontSize: '12px', cursor: 'pointer', borderRadius: '6px' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button onClick={() => checkAndSave(false)} disabled={saving} style={{ padding: '9px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '6px' }}>{saving ? 'Saving…' : 'Confirm & save'}</button>
              <button onClick={() => { setDraftBooking(null); setOverlaps([]) }} style={{ padding: '9px 16px', background: '#363634', color: '#9A9A92', border: 'none', fontSize: '12px', cursor: 'pointer', borderRadius: '6px' }}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* pending images tray */}
      {pendingImages.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: '#9A9A92' }}>{pendingImages.length} screenshot(s) ready</span>
          <button onClick={extractBooking} disabled={extracting} style={{ padding: '7px 14px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '6px' }}>{extracting ? 'Reading…' : '✦ Extract booking'}</button>
          <button onClick={() => setPendingImages([])} style={{ padding: '7px 12px', background: '#363634', color: '#9A9A92', border: 'none', fontSize: '11px', cursor: 'pointer', borderRadius: '6px' }}>Clear</button>
        </div>
      )}
      {savedMsg && <div style={{ fontSize: '12px', color: savedMsg.startsWith('✓') ? '#2ecc71' : '#e88', marginBottom: '8px' }}>{savedMsg}</div>}

      {/* input */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', paddingTop: '12px', borderTop: '0.5px solid #363634' }}>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => addFiles(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} title="Attach booking screenshots" style={{ padding: '13px 14px', background: '#242422', color: '#AEAEA6', border: '0.5px solid #4A4A48', fontSize: '15px', cursor: 'pointer', borderRadius: '10px' }}>📷</button>
        <textarea value={input} onChange={e => setInput(e.target.value)} onPaste={onPaste}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Ask Haussy, or paste booking screenshots…" rows={1}
          style={{ flex: 1, minHeight: '46px', maxHeight: '140px', padding: '12px 15px', background: '#242422', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '14px', outline: 'none', borderRadius: '10px', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        <button onClick={() => send()} disabled={busy || !input.trim()} style={{ padding: '13px 22px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer', borderRadius: '10px' }}>Send</button>
      </div>
    </div>
  )
}
