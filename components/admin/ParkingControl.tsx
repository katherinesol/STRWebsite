'use client'
import { useState, useEffect } from 'react'

export default function ParkingControl({ bookingId, bookingKind, propertyId, guestName, startDate, endDate }: {
  bookingId: string; bookingKind: string; propertyId: string; guestName?: string; startDate: string; endDate: string
}) {
  const [check, setCheck] = useState<any>(null)
  const [current, setCurrent] = useState<any>(null)   // existing assignment
  const [reserve, setReserve] = useState(false)
  const [cars, setCars] = useState(1)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const isRoyalYork = propertyId?.startsWith('royal-york')

  useEffect(() => {
    if (!isRoyalYork || !startDate || !endDate) return
    // availability
    fetch(`/api/admin/parking?property=${propertyId}&start=${startDate}&end=${endDate}&exclude=${bookingId}`)
      .then(r => r.json()).then(setCheck)
    // existing assignment for this booking
    fetch(`/api/admin/parking?overview=1&from=${startDate}&to=${endDate}`)
      .then(r => r.json()).then(d => {
        const mine = (d.assignments || []).find((a: any) => a.booking_id === bookingId)
        if (mine) { setCurrent(mine); setReserve(true); setCars(mine.car_count) }
      })
  }, [propertyId, startDate, endDate, bookingId])

  if (!isRoyalYork) return null

  async function save() {
    setBusy(true); setMsg('')
    if (reserve) {
      const res = await fetch('/api/admin/parking', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, booking_kind: bookingKind, property_id: propertyId, guest_name: guestName, start_date: startDate, end_date: endDate, car_count: cars }),
      })
      const d = await res.json()
      setBusy(false)
      if (d.error) { setMsg(d.error + (d.freeNights?.length ? ` — free: ${d.freeNights.map((n: string) => n.slice(5)).join(', ')}` : '')); return }
      setMsg(`Reserved · ${d.laneName}`); setCurrent({ lane: d.lane, car_count: cars })
    } else {
      await fetch(`/api/admin/parking?booking_id=${bookingId}`, { method: 'DELETE' })
      setBusy(false); setMsg('Parking released'); setCurrent(null)
    }
  }

  const fmt = (nights: string[]) => nights.map(n => new Date(n + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).join(', ')

  return (
    <div style={{ background: '#1E1E1C', border: '0.5px solid #363634', borderRadius: '8px', padding: '14px 16px', marginTop: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', color: '#F0EDE6', fontWeight: 500 }}>Parking</span>
        {current && <span style={{ fontSize: '11px', color: '#7bc47b' }}>· {current.lane === 1 ? 'Wooden fence' : 'Metal fence'}</span>}
      </div>

      {check && (
        check.fullyAvailable ? (
          <div style={{ fontSize: '12px', color: '#7bc47b', background: '#1f2a1a', borderRadius: '6px', padding: '7px 10px', marginBottom: '10px' }}>
            A lane is free for the whole stay{check.laneName ? ` (${check.laneName})` : ''}.
          </div>
        ) : check.fullNights?.length ? (
          <div style={{ fontSize: '12px', color: '#e6a86a', background: '#2a1f0a', borderRadius: '6px', padding: '7px 10px', marginBottom: '10px' }}>
            Both lanes full on: {fmt(check.fullNights)}. Free: {fmt(check.freeNights)}.
          </div>
        ) : null
      )}

      <div style={{ display: 'flex', gap: '18px', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#F0EDE6', cursor: 'pointer' }}>
          <input type="checkbox" checked={reserve} onChange={e => setReserve(e.target.checked)} /> Reserve a lane
        </label>
        {reserve && (
          <label style={{ fontSize: '12px', color: '#9A9A92' }}>Cars
            <select value={cars} onChange={e => setCars(Number(e.target.value))} style={{ marginLeft: '6px', padding: '4px 8px', background: '#242422', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '12px', borderRadius: '4px' }}>
              <option value={1}>1</option><option value={2}>2</option>
            </select>
          </label>
        )}
        <button onClick={save} disabled={busy} style={{ marginLeft: 'auto', padding: '7px 14px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '5px' }}>
          {busy ? '…' : 'Save parking'}
        </button>
      </div>
      {cars === 2 && reserve && <div style={{ fontSize: '11px', color: '#666660', marginTop: '8px' }}>Two cars park front-to-back in one lane (same group coordinates).</div>}
      {msg && <div style={{ fontSize: '12px', color: msg.includes('free') || msg.includes('full') ? '#e6a86a' : '#7bc47b', marginTop: '8px' }}>{msg}</div>}
    </div>
  )
}
