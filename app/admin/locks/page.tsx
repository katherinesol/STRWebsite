'use client'
import { useState, useEffect } from 'react'

const PROP: Record<string, string> = { 'royal-york-east': 'Royal York East', 'royal-york-west': 'Royal York West', 'nickel-beach': 'Nickel Beach', 'royal-york-both': 'Royal York' }

function chip(d: any) {
  if (d.errored) return { bg: '#3a1f1f', fg: '#e57373', label: 'error' }
  if (d.status === 'set') return { bg: '#1f2a1a', fg: '#7bc47b', label: 'active' }
  if (d.status === 'missing') return { bg: '#3a2a1a', fg: '#e6a86a', label: 'missing' }
  if (d.status?.includes('airbnb')) return { bg: '#242422', fg: '#9A9A92', label: 'airbnb' }
  if (d.scheduled) return { bg: '#1a2a2a', fg: '#7bc4c4', label: 'ready \u00b7 on lock' }
  if (d.status === 'setting') return { bg: '#3a2a1a', fg: '#e6a86a', label: 'setting\u2026' }
  return { bg: '#22262a', fg: '#8aa0b4', label: 'queued' }
}

function Row({ b, codeInputs, setCodeInputs, setCode, savingId, msg }: any) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr auto', gap: '12px', alignItems: 'center', padding: '12px 14px', borderTop: '0.5px solid #2A2A28' }}>
      <div>
        <div style={{ fontSize: '13px', color: '#F0EDE6' }}>
          {b.guest || 'Guest'}
          {b.checked_in_at && <span style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: '#1f2a1a', color: '#7bc47b' }}>✓ checked in {new Date(b.checked_in_at).toLocaleString('en-US', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
        </div>
        <div style={{ fontSize: '11px', color: '#8A8A82' }}>{PROP[b.property] || b.property} · {b.platform} · {b.start}</div>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {b.doors.map((d: any, i: number) => {
          const c = chip(d)
          return <span key={i} style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '4px', background: c.bg, color: c.fg }}>{d.lock}: {d.code || '\u2014'} · {c.label}</span>
        })}
      </div>
      <div>
        {b.needs_attention ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: '5px' }}>
              <input value={codeInputs[b.id] || ''} onChange={e => setCodeInputs((s: any) => ({ ...s, [b.id]: e.target.value.replace(/\D/g, '').slice(0, 4) }))} placeholder="0000" maxLength={4}
                style={{ width: '58px', padding: '5px 7px', background: '#1E1E1C', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '13px', fontFamily: 'monospace', textAlign: 'center', borderRadius: '3px' }} />
              <button onClick={() => setCode(b)} disabled={savingId === b.id} style={{ padding: '5px 12px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '4px' }}>{savingId === b.id ? '\u2026' : 'Set'}</button>
            </div>
            {msg[b.id] && <span style={{ fontSize: '9px', color: msg[b.id].startsWith('\u2713') ? '#7bc47b' : '#e6a86a' }}>{msg[b.id]}</span>}
          </div>
        ) : (
          <div style={{ fontFamily: 'monospace', fontSize: '14px', color: '#F0EDE6' }}>{b.code || '\u2014'}</div>
        )}
      </div>
    </div>
  )
}

export default function LocksPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState('')
  const [msg, setMsg] = useState<Record<string, string>>({})

  async function sweep() {
    setLoading(true)
    const r = await fetch('/api/admin/locks/sweep').then(x => x.json())
    setData(r); setLoading(false)
  }
  useEffect(() => { sweep() }, [])

  async function setCode(b: any) {
    const code = (codeInputs[b.id] || '').trim()
    if (!/^\d{4}$/.test(code)) { setMsg(m => ({ ...m, [b.id]: 'Enter 4 digits' })); return }
    setSavingId(b.id); setMsg(m => ({ ...m, [b.id]: '' }))
    const r = await fetch('/api/admin/locks/set-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: b.id, kind: b.kind, code }) }).then(x => x.json())
    setSavingId('')
    if (r.error) { setMsg(m => ({ ...m, [b.id]: r.error })); return }
    setMsg(m => ({ ...m, [b.id]: '✓ programming — re-checking…' }))
    setTimeout(sweep, 1500)
  }

  const rows = data?.bookings || []
  const attention = rows.filter((r: any) => r.needs_attention)
  const rest = rows.filter((r: any) => !r.needs_attention)



  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '30px', color: '#F0EDE6', margin: 0 }}>Locks</h1>
        <button onClick={sweep} disabled={loading} style={{ padding: '7px 16px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '6px' }}>{loading ? 'Checking…' : 'Re-check now'}</button>
      </div>
      {data?.checked_at && <p style={{ fontSize: '11px', color: '#8A8A82', marginBottom: '20px' }}>Last checked {new Date(data.checked_at).toLocaleString()}</p>}

      {attention.length > 0 && (
        <div style={{ background: '#242422', border: '0.5px solid #4a3a1f', borderRadius: '6px', marginBottom: '18px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.1em', color: '#e6a86a', borderBottom: '0.5px solid #363634' }}>Needs attention · {attention.length}</div>
          {attention.map((b: any) => <Row key={b.id} b={b} codeInputs={codeInputs} setCodeInputs={setCodeInputs} setCode={setCode} savingId={savingId} msg={msg} />)}
        </div>
      )}

      <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '6px', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.1em', color: '#9A9A92', borderBottom: '0.5px solid #363634' }}>Upcoming · {rest.length}</div>
        {rest.map((b: any) => <Row key={b.id} b={b} codeInputs={codeInputs} setCodeInputs={setCodeInputs} setCode={setCode} savingId={savingId} msg={msg} />)}
        {!loading && rest.length === 0 && <div style={{ padding: '16px 14px', fontSize: '13px', color: '#666660' }}>Nothing upcoming.</div>}
      </div>
    </div>
  )
}
