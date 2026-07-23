'use client'
import { useState, useRef, useEffect } from 'react'

const PROP_NAMES: Record<string, string> = { 'royal-york-east': 'Royal York East', 'royal-york-west': 'Royal York West', 'nickel-beach': 'Nickel Beach Retreat' }

export default function GuestSupport() {
  const [verified, setVerified] = useState<any>(null)
  const [code, setCode] = useState('')
  const [lastName, setLastName] = useState('')
  const [verifyErr, setVerifyErr] = useState('')
  const [verifying, setVerifying] = useState(false)

  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [escalated, setEscalated] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const [localTime, setLocalTime] = useState('')
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])
  useEffect(() => {
    const tick = () => setLocalTime(new Date().toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' }))
    tick(); const t = setInterval(tick, 30000); return () => clearInterval(t)
  }, [])
  // restore saved session on load
  useEffect(() => {
    try {
      const saved = localStorage.getItem('zuhaus_guest')
      if (saved) {
        const { code: c, lastName: ln } = JSON.parse(saved)
        if (c && ln) { setCode(c); setLastName(ln); setTimeout(() => reVerify(c, ln), 50) }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  async function reVerify(c: string, ln: string) {
    try {
      const res = await fetch('/api/guest-support/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: c, lastName: ln }) })
      const d = await res.json()
      if (d.ok) {
        setVerified({ ...d.booking, code: c })
        if (d.history?.length) setMessages(d.history)
        else { const nm = d.booking.guest_name ? ' ' + d.booking.guest_name.split(' ')[0] : ''; setMessages([{ role: 'assistant', content: `Welcome back,${nm}. How can I help you?` }]) }
      } else { try { localStorage.removeItem('zuhaus_guest') } catch {} }
    } catch {}
  }

  async function verify() {
    setVerifying(true); setVerifyErr('')
    try {
      const res = await fetch('/api/guest-support/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, lastName }) })
      const d = await res.json()
      if (d.error) { setVerifyErr(d.error); return }
      const session = { ...d.booking, code }
      setVerified(session)
      try { localStorage.setItem('zuhaus_guest', JSON.stringify({ code, lastName })) } catch {}
      if (d.history && d.history.length) {
        setMessages(d.history)
      } else {
        const nm = d.booking.guest_name ? ' ' + d.booking.guest_name.split(' ')[0] : ''
        setMessages([{ role: 'assistant', content: `Welcome,${nm}. I'm here to help you settle in and make the most of your stay — from check-in details to our favourite neighbourhood spots. What can I help you with?` }])
      }
    } finally { setVerifying(false) }
  }

  async function send() {
    const q = input.trim(); if (!q || busy) return
    const next = [...messages, { role: 'user', content: q }]
    setMessages(next); setInput(''); setBusy(true)
    try {
      const res = await fetch('/api/guest-support/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: verified.code, booking_id: verified.booking_id, source: verified.source, messages: next.map(m => ({ role: m.role, content: m.content })) }) })
      const d = await res.json()
      setMessages(m => [...m, { role: 'assistant', content: d.error ? `⚠️ ${d.error}` : d.answer }])
    } finally { setBusy(false) }
  }

  async function escalate() {
    const q = input.trim(); if (!q) return
    setBusy(true)
    await fetch('/api/guest-support/escalate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: verified.code, booking_id: verified.booking_id, source: verified.source, message: q }) })
    setMessages(m => [...m, { role: 'user', content: q }, { role: 'assistant', content: 'Of course — I have passed this along to your host, who will be in touch shortly. Is there anything else I can help you with in the meantime?' }])
    setInput(''); setEscalated(true); setBusy(false)
  }

  // poll for new messages (host replies) while verified
  useEffect(() => {
    if (!verified) return
    const poll = async () => {
      if (busy) return
      try {
        const res = await fetch('/api/guest-support/poll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: verified.code, booking_id: verified.booking_id, source: verified.source }) })
        const d = await res.json()
        if (d.messages && d.messages.length) {
          setMessages(prev => d.messages.length > prev.length ? d.messages : prev)
        }
      } catch {}
    }
    const t = setInterval(poll, 6000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified, busy])

  function CopyChip({ value }: { value: string }) {
    const [done, setDone] = useState(false)
    return (
      <span onClick={() => { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#1A1A18', color: '#fff', padding: '2px 10px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '14px', cursor: 'pointer', margin: '0 2px', verticalAlign: 'middle' }}>
        {value}<span style={{ fontSize: '10px', opacity: .7 }}>{done ? '✓ copied' : '⧉ copy'}</span>
      </span>
    )
  }
  function renderContent(text: string) {
    text = String(text).replace(/\[photo:[^\]]*\]/g, '📷 Photo sent').replace(/\[photo\]/g, '📷 Photo sent')
    const parts = String(text).split(/(\{\{copy:[^}]+\}\})/g)
    return parts.map((p, i) => {
      const m = p.match(/^\{\{copy:([^}]+)\}\}$/)
      return m ? <CopyChip key={i} value={m[1]} /> : <span key={i}>{p}</span>
    })
  }

  const photoRef = useRef<HTMLInputElement>(null)
  async function sendPhoto(file: File) {
    if (!file) return
    setBusy(true)
    try {
      const b64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file) })
      setMessages(m => [...m, { role: 'user', content: '📷 (photo sent)' }])
      const res = await fetch('/api/guest-support/photo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: verified.code, booking_id: verified.booking_id, source: verified.source, imageBase64: b64, mediaType: file.type, caption: input.trim() }) })
      const d = await res.json()
      setInput('')
      setMessages(m => [...m, { role: 'assistant', content: d.error ? `⚠️ ${d.error}` : d.answer }])
    } finally { setBusy(false) }
  }

  function signOut() { try { localStorage.removeItem('zuhaus_guest') } catch {}; setVerified(null); setMessages([]); setCode(''); setLastName('') }
  const wrap: React.CSSProperties = { minHeight: '100vh', background: '#F5F2EC', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px', fontFamily: 'var(--sans, system-ui)' }

  if (!verified) {
    return (
      <div style={wrap}>
        <div style={{ maxWidth: '380px', width: '100%', marginTop: '8vh' }}>
          <h1 style={{ fontFamily: 'var(--serif, Georgia)', fontWeight: 300, fontSize: '30px', color: '#1A1A18', marginBottom: '6px' }}>Guest Support</h1>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px', lineHeight: 1.5 }}>Enter your confirmation code and last name to access help with your stay.</p>
          <input placeholder="Confirmation code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} style={{ width: '100%', padding: '13px 15px', fontSize: '15px', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '10px', boxSizing: 'border-box', letterSpacing: '.05em' }} />
          <input placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') verify() }} style={{ width: '100%', padding: '13px 15px', fontSize: '15px', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '14px', boxSizing: 'border-box' }} />
          <button onClick={verify} disabled={verifying || !code || !lastName} style={{ width: '100%', padding: '14px', background: '#1A1A18', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>{verifying ? 'Checking…' : 'Access support'}</button>
          {verifyErr && <div style={{ color: '#c0392b', fontSize: '13px', marginTop: '12px' }}>{verifyErr}</div>}
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...wrap, padding: 0, background: '#fff' }}>
      <div style={{ width: '100%', maxWidth: '640px', display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'var(--serif, Georgia)', fontSize: '18px', color: '#1A1A18' }}>Your stay at {PROP_NAMES[verified.property_id] || 'our home'}</div>
            <div style={{ fontSize: '12px', color: '#999' }}>{verified.check_in} → {verified.check_out}</div>
          </div>
          {localTime && <div style={{ fontSize: '12px', color: '#999', textAlign: 'right' }}>{localTime}<br /><span style={{ fontSize: '10px' }}>local time</span></div>}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {m.role !== 'user' && (
                <span style={{ fontSize: '10px', color: '#B8956B', letterSpacing: '.04em', paddingLeft: '4px' }}>{m.host ? 'Katherine · Host' : 'Virtual Concierge'}</span>
              )}
              <div style={{ padding: '11px 15px', borderRadius: '14px', fontSize: '15px', lineHeight: 1.5, background: m.role === 'user' ? '#1A1A18' : (m.host ? '#EDE7DA' : '#F0EDE6'), color: m.role === 'user' ? '#fff' : '#1A1A18', whiteSpace: 'pre-wrap' }}>{m.role === 'user' ? m.content : renderContent(m.content)}</div>
            </div>
          ))}
          {busy && <div style={{ alignSelf: 'flex-start', color: '#999', fontSize: '14px' }}>…</div>}
          <div ref={endRef} />
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid #eee' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) sendPhoto(f) }} />
            <button onClick={() => photoRef.current?.click()} disabled={busy} title="Send a photo" style={{ padding: '12px 14px', background: '#F0EDE6', color: '#1A1A18', border: '1px solid #ddd', borderRadius: '10px', fontSize: '16px', cursor: 'pointer' }}>📷</button>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} placeholder="Ask about your stay…" style={{ flex: 1, padding: '12px 15px', fontSize: '15px', border: '1px solid #ddd', borderRadius: '10px', outline: 'none' }} />
            <button onClick={send} disabled={busy || !input.trim()} style={{ padding: '12px 20px', background: '#1A1A18', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>Send</button>
          </div>
          <button onClick={escalate} disabled={busy || !input.trim()} style={{ marginTop: '8px', padding: '8px 14px', background: 'none', color: '#666', border: '1px solid #ddd', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>Send this to the host instead ↗</button>
        </div>
      </div>
    </div>
  )
}
