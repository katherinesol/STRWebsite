'use client'
import { useState } from 'react'

export default function NewsletterCompose({ count }: { count: number }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSend() {
    if (!subject || !body) return
    setSending(true)
    try {
      await fetch('/api/admin/newsletter/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body }),
      })
      setSent(true)
      setSubject(''); setBody('')
    } catch {}
    finally { setSending(false) }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    background: '#363634', border: '0.5px solid #4A4A48',
    color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
    outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
  }

  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>
        Compose email
      </div>

      {sent ? (
        <div style={{ fontSize: '14px', color: '#2ecc71', fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
          Email sent to {count} subscriber{count !== 1 ? 's' : ''}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Subject</div>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Summer availability now open" style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Message</div>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={8} placeholder="Write your message..." style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ fontSize: '12px', color: '#666660' }}>
            Will be sent to {count} active subscriber{count !== 1 ? 's' : ''}.
          </div>
          <button onClick={handleSend} disabled={!subject || !body || sending}
            style={{
              padding: '12px', background: subject && body ? 'var(--amber)' : '#363634',
              color: subject && body ? '#1A1A18' : '#666660',
              border: 'none', fontFamily: 'var(--sans)', fontSize: '11px',
              letterSpacing: '.12em', textTransform: 'uppercase',
              cursor: subject && body ? 'pointer' : 'not-allowed', fontWeight: 500,
            }}>
            {sending ? 'Sending...' : `Send to ${count} subscribers`}
          </button>
        </div>
      )}
    </div>
  )
}
