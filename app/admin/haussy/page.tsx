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
  const endRef = useRef<HTMLDivElement>(null)

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

      {/* input */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', paddingTop: '12px', borderTop: '0.5px solid #363634' }}>
        <textarea value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Ask Haussy about your business…" rows={1}
          style={{ flex: 1, minHeight: '46px', maxHeight: '140px', padding: '12px 15px', background: '#242422', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '14px', outline: 'none', borderRadius: '10px', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        <button onClick={() => send()} disabled={busy || !input.trim()} style={{ padding: '13px 22px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer', borderRadius: '10px' }}>Send</button>
      </div>
    </div>
  )
}
