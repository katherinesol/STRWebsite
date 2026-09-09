'use client'
import { useState, useEffect, useRef } from 'react'
import GuideViewer from '@/components/guest/GuideViewer'

import type { POI } from '@/lib/properties'

type HubData = { checkIn: string; checkOut: string; amenities: string[]; houseRules: string[]; faq: { q: string; a: string }[]; highlights: string[]; areaDescription: string; description: string; pois: POI[]; parkingSpots: number }

/* ── design tokens (Solhaus Guest Hub) ───────────────────────── */
const C = {
  page: '#EFE9E0',      // outer canvas
  sheet: '#FBF8F3',     // phone-width column
  card: '#F4EEE4',      // raised card fill
  cardHover: '#EFE7DA',
  line: '#E7DED1',      // hairline border
  lineHover: '#D9CDBB',
  inputLine: '#E2D9CC',
  ink: '#2E2A26',       // primary text
  inkDeep: '#1E1B18',   // button hover
  body: '#6B6359',      // secondary text
  mute: '#9C9084',      // mono eyebrow
  muteFoot: '#8C8378',
  accent: '#B4552F',    // terracotta
  accentHover: '#9C4726',
  accentDeep: '#A34823', // sent-confirmation fill
  accentSoft: '#F0D7C4', // text on terracotta
  footer: '#E4D6C2',
}
const MONO = "'IBM Plex Mono', monospace"
const SANS = 'Jost, Helvetica, sans-serif'

export default function GuestHub({ propertyId, propertyName, data, houfyUrl, contact }: {
  propertyId: string
  propertyName: string
  data?: HubData
  houfyUrl?: string
  contact?: { email?: string; phone?: string }
}) {
  const [view, setView] = useState<'home' | 'guide' | 'recs' | 'arrival'>('home')

  return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', background: C.page, fontFamily: SANS, color: C.ink, WebkitFontSmoothing: 'antialiased' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Jost:wght@200;300;400;500&family=IBM+Plex+Mono:wght@400&display=swap');
        .gh-pretty { text-wrap: pretty; }
        .gh-card { text-decoration: none; transition: background .15s ease, border-color .15s ease; }
        .gh-card:hover { background: ${C.cardHover} !important; border-color: ${C.lineHover} !important; }
        .gh-send:hover { background: ${C.inkDeep} !important; }
        .gh-join:hover { background: ${C.accentHover} !important; }
        .gh-tel { color: ${C.sheet}; text-decoration: none; border-bottom: 1px solid rgba(251,248,243,0.4); }
        .gh-back:hover { color: #7A3418; }
        .gh-input::placeholder { color: #A39A8E; }
        .gh-input:focus { outline: none; }
      `}</style>

      <div style={{ width: '100%', maxWidth: '430px', background: C.sheet, display: 'flex', flexDirection: 'column' }}>

        {/* ── header ── */}
        <div style={{ padding: '44px 28px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', borderBottom: `1px solid ${C.line}` }}>
          <Mark size={36} />
          <div style={{ fontSize: '34px', fontWeight: 300, lineHeight: 1 }}>solhaus</div>
          <div style={{ fontFamily: MONO, fontSize: '10.5px', letterSpacing: '0.28em', textTransform: 'uppercase', color: C.mute, textAlign: 'center' }}>{propertyName}</div>
        </div>

        {view === 'home' && (
          <>
            {/* ── during your stay ── */}
            <div style={{ padding: '34px 24px 8px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={eyebrow}>During your stay</div>

              <button onClick={() => setView('arrival')} className="gh-card" style={cardStyle}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={cardTitle}>Arrival &amp; Getting In</div>
                  <div style={cardSub}>Door code, parking, arriving late</div>
                </div>
                <div style={chevron}>›</div>
              </button>

              <button onClick={() => setView('guide')} className="gh-card" style={cardStyle}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={cardTitle}>House Guide</div>
                  <div style={cardSub}>Wi-Fi, check-out, how things work</div>
                </div>
                <div style={chevron}>›</div>
              </button>

              <button onClick={() => setView('recs')} className="gh-card" style={cardStyle}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={cardTitle}>Local Recommendations</div>
                  <div style={cardSub}>Dining, coffee, things to do</div>
                </div>
                <div style={chevron}>›</div>
              </button>
            </div>

            <Concierge />

            {/*  BOOKING GOES TO HOUFY. Houfy takes no host commission and charges
              *  the guest no service fee, so booking here rather than through a
              *  platform is genuinely better for both sides — which is why this
              *  says what it does instead of a vague "book direct". A property
              *  with no listing shows nothing at all rather than a dead card. */}
            {houfyUrl && (
              <div style={{ padding: '14px 24px 0' }}>
                <a href={houfyUrl} target="_blank" rel="noopener noreferrer" className="gh-card"
                  style={{ ...cardStyle, background: C.sheet, border: `1px solid ${C.lineHover}` }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={cardTitle}>Book with Solhaus</div>
                    <div style={cardSub}>No guest service fee, any future stay</div>
                  </div>
                  <div style={chevron}>›</div>
                </a>
              </div>
            )}

            <DirectBookingCapture propertyId={propertyId} />
            <ReachUs contact={contact} />
          </>
        )}

        {view === 'guide' && <SubPage title="House Guide" onBack={() => setView('home')}><GuideViewer propertyId={propertyId} /></SubPage>}
        {view === 'recs' && (
          <SubPage title="Local Recommendations" onBack={() => setView('home')}>
            <Nearby pois={data?.pois || []} />
          </SubPage>
        )}
        {view === 'arrival' && (
          <SubPage title="Arrival &amp; Getting In" onBack={() => setView('home')}>
            <Arrival data={data} />
          </SubPage>
        )}

        {/* ── footer ── */}
        <div style={{ marginTop: 'auto', background: C.footer, padding: '34px 24px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '19px', fontWeight: 300, color: C.ink }}>Welcome — we hope you enjoy your stay.</div>
          <div style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.24em', textTransform: 'uppercase', color: C.muteFoot, textAlign: 'center' }}>solhaus</div>
        </div>

      </div>
    </div>
  )
}

/*  LOCAL RECOMMENDATIONS, from the real place data.
 *
 *  lib/properties.ts has carried six places per property — with genuine walking
 *  and driving times — since the file was written, while this screen said
 *  "coming soon". Nothing needed collecting; it needed rendering.
 *
 *  Ordered nearest-first by however you would actually get there: a two-minute
 *  walk to the beach outranks a six-minute drive to the shops, which is the
 *  order a guest standing in the doorway cares about. */
const CATEGORY_LABEL: Record<string, string> = {
  restaurant: 'Eat', cafe: 'Coffee', transit: 'Transit', grocery: 'Groceries',
  beach: 'Beach', park: 'Outdoors', attraction: 'Worth the trip', pharmacy: 'Pharmacy',
}

function Nearby({ pois }: { pois: POI[] }) {
  if (!pois.length) return <p style={placeholder}>We&apos;re still writing this one up.</p>

  const effort = (p: POI) => p.walkMins ?? ((p.driveMins ?? 999) + 100)
  const sorted = [...pois].sort((a, b) => effort(a) - effort(b))

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {sorted.map((p, i) => (
        <div key={p.id} style={{
          display: 'flex', alignItems: 'baseline', gap: '14px', padding: '16px 4px',
          borderBottom: i === sorted.length - 1 ? 'none' : `1px solid ${C.line}`,
        }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '17px', fontWeight: 400, color: C.ink }}>{p.name}</div>
            <div style={{ fontFamily: MONO, fontSize: '9.5px', letterSpacing: '0.18em', textTransform: 'uppercase', color: C.mute }}>
              {CATEGORY_LABEL[p.category] || p.category}
            </div>
            {p.note ? <div style={{ fontSize: '14px', fontWeight: 300, color: C.body, lineHeight: 1.5 }}>{p.note}</div> : null}
          </div>
          <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
            {p.walkMins ? <Badge label="walk" mins={p.walkMins} strong /> : null}
            {p.driveMins ? <Badge label="drive" mins={p.driveMins} strong={!p.walkMins} /> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function Badge({ label, mins, strong }: { label: string; mins: number; strong?: boolean }) {
  return (
    <div style={{
      fontFamily: MONO, fontSize: '10px', letterSpacing: '0.06em', whiteSpace: 'nowrap',
      color: strong ? C.accent : C.mute,
    }}>{mins} min {label}</div>
  )
}

/*  ARRIVAL. The check-in and check-out times are the property's real ones, not
 *  copy — the same values the lock windows are built from, so this screen and
 *  the door agree by construction.
 *
 *  IT DELIBERATELY DOES NOT SHOW A DOOR CODE. The hub is reachable by anyone who
 *  knows the URL; codes reach a guest through their own booking. */
function Arrival({ data }: { data?: HubData }) {
  const rows: [string, string][] = [
    ['Check-in', data?.checkIn || '4:00 PM'],
    ['Check-out', data?.checkOut || '11:00 AM'],
  ]
  if (data?.parkingSpots) rows.push(['Parking', `${data.parkingSpots} space${data.parkingSpots > 1 ? 's' : ''} on site`])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map(([k, v], i) => (
          <div key={k} style={{
            display: 'flex', alignItems: 'baseline', gap: '14px', padding: '14px 4px',
            borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${C.line}`,
          }}>
            <div style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: C.mute, width: '78px', flex: 'none' }}>{k}</div>
            <div style={{ fontSize: '17px', fontWeight: 300, color: C.ink }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '17px', fontWeight: 400, color: C.ink }}>Your door code</div>
        <div style={{ fontSize: '14.5px', fontWeight: 300, lineHeight: 1.6, color: C.body }} className="gh-pretty">
          Sent with your booking confirmation, and again the morning you arrive.
          Arriving late is fine — the code works from check-in time onward. Message
          us below if you need it resent.
        </div>
      </div>
    </div>
  )
}

/*  REACH US. Renders only the channels that have a real address behind them: a
 *  hub that prints a placeholder phone number is worse than one that prints
 *  none, because a guest will actually dial it. */
function ReachUs({ contact }: { contact?: { email?: string; phone?: string } }) {
  const rows = [
    contact?.email ? { k: 'Email', v: contact.email, href: `mailto:${contact.email}` } : null,
    contact?.phone ? { k: 'Text', v: contact.phone, href: `tel:${contact.phone.replace(/[^+\d]/g, '')}` } : null,
  ].filter(Boolean) as { k: string; v: string; href: string }[]
  if (!rows.length) return null

  return (
    <div style={{ padding: '26px 24px 0' }}>
      <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: '26px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={eyebrow}>Reach us</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((r, i) => (
            <div key={r.k} style={{
              display: 'flex', alignItems: 'baseline', gap: '14px', padding: '13px 4px',
              borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${C.line}`,
            }}>
              <div style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: C.mute, width: '62px', flex: 'none' }}>{r.k}</div>
              <a href={r.href} style={{ fontSize: '16px', fontWeight: 300, color: C.accent, textDecoration: 'none' }}>{r.v}</a>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Mark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-label="Solhaus mark">
      <path d="M4 42 L60 16 L116 42 L116 55 L60 29 L4 55 Z M60 40 A30 30 0 1 0 60 100 A30 30 0 1 0 60 40 Z" fill={C.accent} />
    </svg>
  )
}

// Renders the {{copy:VALUE}} tokens the concierge bot emits for door codes / wifi passwords.
function ConciergeText({ text }: { text: string }) {
  const parts = String(text).split(/(\{\{copy:[^}]+\}\})/g)
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\{\{copy:([^}]+)\}\}$/)
        if (!m) return <span key={i}>{p}</span>
        return (
          <span key={i} onClick={() => navigator.clipboard?.writeText(m[1])} title="Tap to copy"
            style={{ display: 'inline-block', background: C.ink, color: C.sheet, padding: '1px 9px', fontFamily: MONO, fontSize: '13px', cursor: 'pointer', margin: '0 2px' }}>{m[1]}</span>
        )
      })}
    </>
  )
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type GuestSession = { code: string; booking_id: string; source: string; guest_name?: string; property_id?: string }

function Concierge() {
  // Gate: booking-specific answers require confirmation code + last name.
  // Reuses /api/guest-support/verify and the same localStorage session as /support.
  const [verified, setVerified] = useState<GuestSession | null>(null)
  const [code, setCode] = useState('')
  const [lastName, setLastName] = useState('')
  const [verifyErr, setVerifyErr] = useState('')
  const [verifying, setVerifying] = useState(false)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [messages, busy])

  // Restore an existing guest session (shared with /support). runVerify only
  // touches state after its fetch resolves, so nothing is set synchronously here.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('zuhaus_guest')
      if (!saved) return
      const { code: c, lastName: ln } = JSON.parse(saved)
      if (c && ln) void runVerify(c, ln, true)
    } catch {}
  }, [])

  async function runVerify(c: string, ln: string, silent = false) {
    if (!silent) { setVerifying(true); setVerifyErr('') }
    try {
      const res = await fetch('/api/guest-support/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c, lastName: ln }),
      })
      const d = await res.json().catch(() => ({}))
      if (!d.ok) {
        if (silent) { try { localStorage.removeItem('zuhaus_guest') } catch {} }
        else setVerifyErr(d.error || 'No booking found with that code and last name.')
        return
      }
      setVerified({ ...d.booking, code: c })
      try { localStorage.setItem('zuhaus_guest', JSON.stringify({ code: c, lastName: ln })) } catch {}
      if (d.history?.length) setMessages(d.history)
      else {
        const nm = d.booking.guest_name ? ' ' + d.booking.guest_name.split(' ')[0] : ''
        setMessages([{ role: 'assistant', content: `Welcome,${nm}. How can I help with your stay?` }])
      }
    } catch {
      if (!silent) setVerifyErr('Something went wrong. Please try again.')
    } finally {
      if (!silent) setVerifying(false)
    }
  }

  async function send() {
    const q = input.trim()
    if (!q || busy || !verified) return
    const next: ChatMessage[] = [...messages, { role: 'user', content: q }]
    setMessages(next); setInput(''); setBusy(true)
    try {
      const res = await fetch('/api/guest-support/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: verified.code, booking_id: verified.booking_id, source: verified.source,
          messages: next.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const d = await res.json().catch(() => ({}))
      setMessages(m => [...m, { role: 'assistant', content: d.error ? `⚠️ ${d.error}` : d.answer }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: '⚠️ Network error — please try again.' }])
    } finally { setBusy(false) }
  }

  const fieldStyle: React.CSSProperties = { background: C.sheet, border: 'none', padding: '15px 16px', fontFamily: SANS, fontSize: '16px', fontWeight: 300, color: C.ink, outline: 'none', boxSizing: 'border-box', width: '100%' }

  return (
    <div style={{ padding: '26px 24px 34px' }}>
      <div style={{ background: C.accent, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontFamily: MONO, fontSize: '10.5px', letterSpacing: '0.26em', textTransform: 'uppercase', color: C.accentSoft }}>Guest concierge</div>

        {!verified ? (
          <>
            <div className="gh-pretty" style={{ fontSize: '17px', fontWeight: 300, lineHeight: 1.5, color: C.sheet }}>Questions, recommendations, or something not quite right? Enter your confirmation code and last name and we&rsquo;re here to help.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input className="gh-input" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Confirmation code" style={{ ...fieldStyle, letterSpacing: '.05em' }} />
              <input className="gh-input" value={lastName} onChange={e => setLastName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') runVerify(code, lastName) }} placeholder="Last name" style={fieldStyle} />
              <button onClick={() => runVerify(code, lastName)} disabled={verifying || !code.trim() || !lastName.trim()} className="gh-send"
                style={{ background: C.ink, border: 'none', color: C.sheet, fontFamily: MONO, fontSize: '10.5px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '15px', cursor: verifying || !code.trim() || !lastName.trim() ? 'default' : 'pointer', opacity: verifying || !code.trim() || !lastName.trim() ? 0.65 : 1 }}>
                {verifying ? 'Checking…' : 'Access concierge'}
              </button>
              {verifyErr && <div style={{ fontSize: '13px', fontWeight: 300, color: C.sheet, background: C.accentDeep, padding: '12px 14px', lineHeight: 1.45 }}>{verifyErr}</div>}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
              {messages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: m.role === 'user' ? C.accentDeep : C.sheet, color: m.role === 'user' ? C.sheet : C.ink, padding: '12px 15px', fontSize: '15px', fontWeight: 300, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {m.role === 'user' ? m.content : <ConciergeText text={m.content} />}
                </div>
              ))}
              {busy && <div style={{ alignSelf: 'flex-start', color: C.accentSoft, fontSize: '15px', fontWeight: 300 }}>…</div>}
              <div ref={endRef} />
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
              <input className="gh-input" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} placeholder="Ask about your stay…"
                style={{ flex: 1, minWidth: 0, background: C.sheet, border: 'none', padding: '16px 16px', fontFamily: SANS, fontSize: '16px', fontWeight: 300, color: C.ink, outline: 'none' }} />
              <button onClick={send} disabled={busy || !input.trim()} className="gh-send" style={{ flex: 'none', background: C.ink, border: 'none', color: C.sheet, fontFamily: MONO, fontSize: '10.5px', letterSpacing: '0.2em', textTransform: 'uppercase', padding: '0 20px', cursor: busy || !input.trim() ? 'default' : 'pointer', opacity: busy || !input.trim() ? 0.65 : 1 }}>Send</button>
            </div>
          </>
        )}

        <div style={{ fontSize: '13px', fontWeight: 300, color: C.accentSoft }}>Or text us anytime · <a href="tel:+14165550137" className="gh-tel">(416) 555-0137</a></div>
      </div>
    </div>
  )
}

function DirectBookingCapture({ propertyId }: { propertyId: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [joined, setJoined] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function join() {
    if (!email.trim() || saving) return
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/hub/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId, name, email, phone }),
      })
      const d = await res.json().catch(() => ({}))
      // success state is shown only once the row is actually saved
      if (res.ok && d.ok) setJoined(true)
      else setErr(d.error || "We couldn't save your details. Please try again.")
    } catch {
      setErr('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '34px 24px 34px', display: 'flex', flexDirection: 'column', gap: '14px', borderTop: `1px solid ${C.line}` }}>
      <div style={eyebrow}>Before you go</div>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, padding: '30px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '26px', fontWeight: 300 }}>Until next time</div>
          <div className="gh-pretty" style={{ fontSize: '15.5px', fontWeight: 300, lineHeight: 1.55, color: C.body }}>Loved your stay? Leave your details and we&rsquo;ll send you everything you need to book directly with Solhaus.</div>
        </div>

        {joined ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: C.sheet, border: `1px solid ${C.inputLine}`, padding: '18px' }}>
            <Mark size={26} />
            <div style={{ fontSize: '15.5px', fontWeight: 300, color: C.ink, lineHeight: 1.45 }}>You&rsquo;re on the list. Your direct-booking link is on its way.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input className="gh-input" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Name" style={inputStyle} />
            <input className="gh-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
            <input className="gh-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone (optional)" style={inputStyle} />
            <button onClick={join} disabled={saving || !email.trim()} className="gh-join" style={{ background: C.accent, border: 'none', padding: '17px', marginTop: '4px', color: C.sheet, fontFamily: MONO, fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', cursor: saving || !email.trim() ? 'default' : 'pointer', opacity: saving || !email.trim() ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Keep in touch'}</button>
            {err && <div style={{ fontSize: '13px', fontWeight: 300, color: '#9C2B14', lineHeight: 1.45 }}>{err}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

function SubPage({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div style={{ padding: '34px 24px 40px' }}>
      <button onClick={onBack} className="gh-back" style={{ fontFamily: MONO, fontSize: '10.5px', letterSpacing: '0.26em', textTransform: 'uppercase', color: C.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '18px' }}>‹ Back</button>
      <h2 style={{ fontSize: '26px', fontWeight: 300, margin: '0 0 18px', color: C.ink }}>{title}</h2>
      {children}
    </div>
  )
}

const eyebrow: React.CSSProperties = { fontFamily: MONO, fontSize: '10.5px', letterSpacing: '0.26em', textTransform: 'uppercase', color: C.mute, paddingLeft: '4px' }
const cardStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '18px', width: '100%', padding: '20px 22px', background: C.card, border: `1px solid ${C.line}`, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }
const cardTitle: React.CSSProperties = { fontSize: '20px', fontWeight: 400, color: C.ink }
const cardSub: React.CSSProperties = { fontSize: '14px', fontWeight: 300, color: C.body }
const chevron: React.CSSProperties = { fontSize: '22px', fontWeight: 300, color: C.accent, lineHeight: 1 }
const placeholder: React.CSSProperties = { fontSize: '15.5px', fontWeight: 300, color: C.body, lineHeight: 1.55, margin: 0 }
const inputStyle: React.CSSProperties = { background: C.sheet, border: `1px solid ${C.inputLine}`, padding: '15px 16px', fontFamily: SANS, fontSize: '16px', fontWeight: 300, color: C.ink, outline: 'none', boxSizing: 'border-box', width: '100%' }
