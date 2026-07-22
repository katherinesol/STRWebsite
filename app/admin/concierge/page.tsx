'use client'
import { useState, useEffect, useRef } from 'react'

const PROPS = [
  { id: 'royal-york-east', name: 'Royal York East' },
  { id: 'royal-york-west', name: 'Royal York West' },
  { id: 'nickel-beach', name: 'Nickel Beach Retreat' },
]

function fmtDate(s: string) {
  if (!s) return ''
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ConciergeTrainingCenter() {
  const [prop, setProp] = useState('royal-york-east')
  const [entries, setEntries] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])
  function loadKB() { fetch('/api/admin/knowledge').then(r => r.json()).then(d => { if (d.entries) setEntries(d.entries) }) }
  useEffect(() => { loadKB() }, [])
  // reset test chat when switching property
  useEffect(() => { setMessages([]) }, [prop])

  async function send() {
    const q = input.trim(); if (!q || busy) return
    const next = [...messages, { role: 'user', content: q }]
    setMessages(next); setInput(''); setBusy(true)
    try {
      const res = await fetch('/api/admin/concierge-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ property_id: prop, messages: next.map(m => ({ role: m.role, content: m.content })) }) })
      const d = await res.json()
      setMessages(m => [...m, { role: 'assistant', content: d.error ? `⚠️ ${d.error}` : d.answer, escalated: d.escalated }])
    } finally { setBusy(false) }
  }

  const propEntries = entries.filter(e => e.property_id === prop || e.property_id === 'general')
  // group by topic
  const byTopic: Record<string, any[]> = {}
  for (const e of propEntries) { const t = e.topic || 'other'; (byTopic[t] ||= []).push(e) }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '30px', color: '#F0EDE6', margin: 0 }}>Concierge Training</h1>
        <p style={{ fontSize: '12px', color: '#9A9A92', marginTop: '2px' }}>Test how your Virtual Concierge responds, and see everything it knows.</p>
      </div>

      {/* property selector */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {PROPS.map(p => (
          <button key={p.id} onClick={() => setProp(p.id)} style={{ padding: '8px 16px', background: prop === p.id ? 'var(--amber)' : '#242422', color: prop === p.id ? '#242422' : '#AEAEA6', border: '0.5px solid #363634', borderRadius: '6px', fontSize: '13px', fontWeight: prop === p.id ? 600 : 400, cursor: 'pointer' }}>{p.name}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
        {/* TEST CHAT */}
        <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '8px', display: 'flex', flexDirection: 'column', height: '560px' }}>
          <div style={{ padding: '14px 16px', borderBottom: '0.5px solid #363634', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--amber)' }}>Test Chat — as a guest</div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {!messages.length && <div style={{ fontSize: '13px', color: '#666660', margin: 'auto', textAlign: 'center', padding: '0 20px' }}>Ask anything a guest might ask — "what's the wifi?", "how do I check in?", "any good restaurants nearby?" — to see how the concierge responds with the current knowledge.</div>}
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                {m.role !== 'user' && <span style={{ fontSize: '9px', color: m.escalated ? '#e6a86a' : '#B8956B', paddingLeft: '4px' }}>{m.escalated ? 'Virtual Concierge · escalated' : 'Virtual Concierge'}</span>}
                <div style={{ padding: '9px 13px', borderRadius: '12px', fontSize: '13px', lineHeight: 1.5, background: m.role === 'user' ? 'var(--amber)' : '#363634', color: m.role === 'user' ? '#242422' : '#F0EDE6', whiteSpace: 'pre-wrap', marginTop: '2px' }}>{m.content}</div>
              </div>
            ))}
            {busy && <div style={{ alignSelf: 'flex-start', fontSize: '12px', color: '#9A9A92' }}>…</div>}
            <div ref={endRef} />
          </div>
          <div style={{ padding: '12px', borderTop: '0.5px solid #363634', display: 'flex', gap: '8px' }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} placeholder="Ask as a guest…" style={{ flex: 1, padding: '10px 13px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '13px', borderRadius: '8px', outline: 'none' }} />
            <button onClick={send} disabled={busy || !input.trim()} style={{ padding: '10px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', borderRadius: '8px' }}>Send</button>
          </div>
        </div>

        {/* KNOWLEDGE VIEW */}
        <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '8px', height: '560px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px', borderBottom: '0.5px solid #363634', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--amber)' }}>What it knows</span>
            <span style={{ fontSize: '11px', color: '#666660' }}>{propEntries.length} entries</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {!propEntries.length && <div style={{ fontSize: '13px', color: '#666660', textAlign: 'center', marginTop: '40px' }}>No knowledge yet for this property.<br />The concierge will escalate everything until you add some.</div>}
            {Object.entries(byTopic).map(([topic, items]) => (
              <div key={topic} style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.1em', color: '#9A9A92', marginBottom: '8px' }}>{topic}</div>
                {items.map(e => (
                  <div key={e.id} style={{ background: '#1E1E1C', border: '0.5px solid #2A2A28', borderRadius: '6px', padding: '11px 13px', marginBottom: '8px' }}>
                    <div style={{ fontSize: '13px', color: '#F0EDE6', fontWeight: 500, marginBottom: '3px' }}>{e.title}{e.property_id === 'general' && <span style={{ fontSize: '9px', color: '#666660', marginLeft: '6px' }}>· general</span>}</div>
                    <div style={{ fontSize: '12px', color: '#AEAEA6', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{e.content}</div>
                    <div style={{ fontSize: '9px', color: '#555550', marginTop: '6px' }}>{e.updated_at && e.updated_at !== e.created_at ? `Updated ${fmtDate(e.updated_at)}` : `Added ${fmtDate(e.created_at)}`}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
