'use client'
import { useState, useEffect, useRef } from 'react'

const PROPERTIES: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach': 'Nickel Beach',
}
const channelBadge = (c: string) => {
  const map: Record<string, { label: string; color: string }> = {
    direct: { label: 'Direct', color: '#B8956B' },
    sms: { label: 'SMS', color: '#3498db' },
    whatsapp: { label: 'WhatsApp', color: '#25D366' },
    email: { label: 'Email', color: '#9A9A92' },
    houfy: { label: 'Houfy', color: '#e67e22' },
  }
  return map[c] || { label: c, color: '#9A9A92' }
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<any[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [thread, setThread] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(true)
  const [drafting, setDrafting] = useState(false)
  const [sending, setSending] = useState(false)
  const threadEndRef = useRef<HTMLDivElement>(null)

  function loadConversations() {
    fetch('/api/admin/inbox').then(r => r.json()).then(d => { if (d.conversations) setConversations(d.conversations) }).finally(() => setLoading(false))
  }
  useEffect(() => { loadConversations() }, [])

  async function openThread(id: string) {
    setActiveId(id); setThread(null); setMessages([]); setReply('')
    const d = await fetch(`/api/admin/inbox/${id}`).then(r => r.json())
    setThread(d.conversation); setMessages(d.messages || [])
    loadConversations() // refresh unread state
  }

  useEffect(() => { threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send() {
    if (!reply.trim() || !activeId) return
    setSending(true)
    await fetch('/api/admin/inbox/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversation_id: activeId, body: reply, sender: 'host' }) })
    setReply(''); setSending(false)
    const d = await fetch(`/api/admin/inbox/${activeId}`).then(r => r.json())
    setMessages(d.messages || []); loadConversations()
  }

  // AI draft — streams into the reply box
  async function draftReply() {
    if (!activeId) return
    setDrafting(true); setReply('')
    try {
      const res = await fetch('/api/admin/inbox/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: activeId }),
      })
      if (!res.body) { setDrafting(false); return }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setReply(acc)
      }
    } catch {}
    finally { setDrafting(false) }
  }

  if (loading) return <div style={{ color: '#9A9A92' }}>Loading…</div>

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 100px)', border: '0.5px solid #363634', borderRadius: '4px', overflow: 'hidden' }}>
      {/* conversation list */}
      <div style={{ width: '300px', borderRight: '0.5px solid #363634', overflowY: 'auto', flexShrink: 0, background: '#1E1E1C' }}>
        <div style={{ padding: '16px 18px', borderBottom: '0.5px solid #363634' }}>
          <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '20px', color: '#F0EDE6', margin: 0 }}>Inbox</h1>
        </div>
        {!conversations.length ? <div style={{ padding: '20px', color: '#666660', fontSize: '13px' }}>No conversations yet.</div> :
          conversations.map(c => {
            const badge = channelBadge(c.channel)
            const active = c.id === activeId
            return (
              <div key={c.id} onClick={() => openThread(c.id)} style={{ padding: '14px 18px', cursor: 'pointer', borderBottom: '0.5px solid #2A2A28', background: active ? '#242422' : 'transparent', borderLeft: active ? '2px solid var(--amber)' : '2px solid transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                  <span style={{ fontSize: '14px', color: '#F0EDE6', fontWeight: c.unread ? 600 : 400 }}>{c.guest_name || 'Guest'}</span>
                  <span style={{ fontSize: '9px', color: badge.color, textTransform: 'uppercase', letterSpacing: '.06em' }}>{badge.label}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#9A9A92', marginBottom: '2px' }}>{PROPERTIES[c.property_id] || ''}</div>
                <div style={{ fontSize: '12px', color: c.unread ? '#AEAEA6' : '#666660', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_message_preview || '—'}</div>
              </div>
            )
          })}
      </div>

      {/* thread */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#161614' }}>
        {!activeId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666660', fontSize: '14px' }}>Select a conversation</div>
        ) : (
          <>
            <div style={{ padding: '14px 20px', borderBottom: '0.5px solid #363634', flexShrink: 0 }}>
              <div style={{ fontSize: '15px', color: '#F0EDE6' }}>{thread?.guest_name || 'Guest'}</div>
              <div style={{ fontSize: '11px', color: '#9A9A92' }}>{PROPERTIES[thread?.property_id] || ''} · {channelBadge(thread?.channel || 'direct').label}</div>
            </div>

            {/* messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {messages.map(m => {
                const photoMatch = String(m.body || '').match(/\[photo:\s*(\S+?)\]/)
                const rawPhoto = photoMatch ? photoMatch[1] : null
                const photoUrl = rawPhoto ? (rawPhoto.startsWith('http') ? rawPhoto : `/api/admin/photo?path=${encodeURIComponent(rawPhoto)}`) : null
                const textPart = String(m.body || '').replace(/\[photo:[^\]]*\]/g, '').replace(/\[photo\]/g, '').trim()
                const isGuest = m.sender === 'guest'
                const isAI = m.sender === 'ai'
                return (
                  <div key={m.id} style={{ alignSelf: isGuest ? 'flex-start' : 'flex-end', maxWidth: '70%' }}>
                    <div style={{ padding: '10px 14px', borderRadius: '10px', fontSize: '14px', lineHeight: 1.5,
                      background: isGuest ? '#242422' : isAI ? '#2a2416' : 'var(--amber)',
                      color: isGuest ? '#F0EDE6' : isAI ? '#F0EDE6' : '#242422',
                      borderBottomLeftRadius: isGuest ? '2px' : '10px',
                      borderBottomRightRadius: isGuest ? '10px' : '2px' }}>
                      {textPart && <div style={{ marginBottom: photoUrl ? '8px' : 0 }}>{textPart}</div>}
                      {photoUrl && (
                        <a href={photoUrl} target="_blank" rel="noopener noreferrer">
                          <img src={photoUrl} alt="Guest photo" style={{ maxWidth: '100%', maxHeight: '260px', borderRadius: '6px', display: 'block' }} />
                        </a>
                      )}
                      {!textPart && !photoUrl && m.body}
                    </div>
                    <div style={{ fontSize: '9px', color: '#666660', marginTop: '3px', textAlign: isGuest ? 'left' : 'right' }}>
                      {isAI ? 'AI · ' : ''}{new Date(m.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                )
              })}
              <div ref={threadEndRef} />
            </div>

            {/* reply box */}
            <div style={{ padding: '14px 20px', borderTop: '0.5px solid #363634', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button onClick={draftReply} disabled={drafting} style={{ padding: '6px 14px', background: '#2a2416', color: 'var(--amber)', border: '0.5px solid #4a3f1f', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '4px' }}>
                  {drafting ? '✦ Drafting…' : '✦ Draft reply'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="Type a reply, or let your assistant draft one…"
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
                  style={{ flex: 1, minHeight: '44px', maxHeight: '160px', padding: '11px 14px', background: '#242422', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '14px', outline: 'none', borderRadius: '6px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                <button onClick={send} disabled={sending || !reply.trim()} style={{ padding: '11px 22px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', borderRadius: '6px' }}>
                  {sending ? '…' : 'Send'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
