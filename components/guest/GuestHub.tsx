'use client'
import { useState } from 'react'
import GuideViewer from '@/components/guest/GuideViewer'

type HubData = { checkIn: string; checkOut: string; amenities: string[]; houseRules: string[]; faq: { q: string; a: string }[]; highlights: string[]; areaDescription: string; description: string }

export default function GuestHub({ propertyId, propertyName, data }: { propertyId: string; propertyName: string; data?: HubData }) {
  const [view, setView] = useState<'home' | 'guide' | 'recs'>('home')

  return (
    <div style={{ minHeight: '100vh', background: '#faf9f5', color: '#2a2724', fontFamily: "'Jost', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .gh-mono { font-family: 'IBM Plex Mono', monospace; }
      `}</style>

      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '48px 24px 64px' }}>
        {/* header */}
        <div style={{ marginBottom: '40px' }}>
          <div className="gh-mono" style={{ fontSize: '11px', letterSpacing: '.28em', textTransform: 'uppercase', color: '#B4552F', marginBottom: '10px' }}>solhaus</div>
          <h1 style={{ fontSize: '30px', fontWeight: 300, margin: 0, letterSpacing: '-.01em', color: '#2a2724' }}>{propertyName}</h1>
        </div>

        {view === 'home' && (
          <>
            <div className="gh-mono" style={{ fontSize: '10px', letterSpacing: '.2em', textTransform: 'uppercase', color: '#9a938a', marginBottom: '16px' }}>During your stay</div>

            <button onClick={() => setView('guide')} style={cardStyle}>
              <div>
                <div style={cardTitle}>House Guide</div>
                <div style={cardSub}>Wi-Fi, check-out, how things work</div>
              </div>
              <span style={arrow}>›</span>
            </button>

            <button onClick={() => setView('recs')} style={cardStyle}>
              <div>
                <div style={cardTitle}>Local Recommendations</div>
                <div style={cardSub}>Dining, coffee, things to do</div>
              </div>
              <span style={arrow}>›</span>
            </button>

            <Concierge propertyId={propertyId} />

            <DirectBookingCapture propertyId={propertyId} />
          </>
        )}

        {view === 'guide' && <SubPage title="House Guide" onBack={() => setView('home')}><p style={placeholder}>House guide content coming soon — Wi-Fi, check-out instructions, and how everything works.</p></SubPage>}
        {view === 'recs' && <SubPage title="Local Recommendations" onBack={() => setView('home')}><p style={placeholder}>Local recommendations coming soon — dining, coffee, and things to do nearby.</p></SubPage>}
      </div>
    </div>
  )
}

function Concierge({ propertyId }: { propertyId: string }) {
  const [msg, setMsg] = useState('')
  const [sent, setSent] = useState(false)
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e6e0d6', borderRadius: '14px', padding: '20px', marginTop: '24px' }}>
      <div style={cardTitle}>Guest concierge</div>
      <p style={{ fontSize: '13px', color: '#6a635a', lineHeight: 1.5, margin: '6px 0 14px' }}>Questions, recommendations, or something not quite right? We're here to help.</p>
      {sent ? (
        <div style={{ fontSize: '13px', color: '#B4552F' }}>Message sent — we usually reply within the hour.</div>
      ) : (
        <>
          <textarea value={msg} onChange={e => setMsg(e.target.value)} placeholder="How can we help?" rows={3}
            style={{ width: '100%', padding: '10px 12px', background: '#faf9f5', border: '0.5px solid #e6e0d6', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', color: '#2a2724' }} />
          <button onClick={() => { if (msg.trim()) setSent(true) }} style={{ marginTop: '10px', padding: '9px 20px', background: '#B4552F', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Send</button>
        </>
      )}
      <div className="gh-mono" style={{ fontSize: '11px', color: '#9a938a', marginTop: '14px' }}>Or text us anytime · (416) 555-0137</div>
    </div>
  )
}

function DirectBookingCapture({ propertyId }: { propertyId: string }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [done, setDone] = useState(false)
  return (
    <div style={{ marginTop: '40px', paddingTop: '32px', borderTop: '0.5px solid #e6e0d6' }}>
      <div className="gh-mono" style={{ fontSize: '10px', letterSpacing: '.2em', textTransform: 'uppercase', color: '#9a938a', marginBottom: '12px' }}>Until next time</div>
      <p style={{ fontSize: '14px', color: '#4a443c', lineHeight: 1.6, margin: '0 0 16px' }}>Loved your stay? Leave your details and we'll send you everything you need to book directly with Solhaus.</p>
      {done ? (
        <div style={{ fontSize: '13px', color: '#B4552F' }}>You're on the list. Your direct-booking link is on its way.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" style={inputStyle} />
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <button onClick={() => { if (name && email) setDone(true) }} style={{ padding: '11px', background: '#2a2724', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>Keep in touch</button>
        </div>
      )}
    </div>
  )
}

function SubPage({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button onClick={onBack} className="gh-mono" style={{ fontSize: '11px', color: '#B4552F', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '20px' }}>‹ back</button>
      <h2 style={{ fontSize: '22px', fontWeight: 300, margin: '0 0 16px' }}>{title}</h2>
      {children}
    </div>
  )
}

const cardStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: '#fff', border: '0.5px solid #e6e0d6', borderRadius: '14px', padding: '18px 20px', marginBottom: '12px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }
const cardTitle: React.CSSProperties = { fontSize: '16px', fontWeight: 500, color: '#2a2724' }
const cardSub: React.CSSProperties = { fontSize: '13px', color: '#9a938a', marginTop: '3px' }
const arrow: React.CSSProperties = { fontSize: '20px', color: '#B4552F' }
const placeholder: React.CSSProperties = { fontSize: '14px', color: '#6a635a', lineHeight: 1.6 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '11px 12px', background: '#fff', border: '0.5px solid #e6e0d6', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box', color: '#2a2724' }
