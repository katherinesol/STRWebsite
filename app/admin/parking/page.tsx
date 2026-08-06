'use client'
import { useState, useEffect } from 'react'

const LANE_NAMES: Record<number, string> = { 1: 'Wooden fence', 2: 'Metal fence' }
const UNIT: Record<string, string> = { 'royal-york-east': 'East', 'royal-york-west': 'West' }
const LANE_COLOR: Record<number, { bg: string; fg: string }> = {
  1: { bg: '#1f2a1a', fg: '#7bc47b' },   // wooden = warm green
  2: { bg: '#0a1520', fg: '#6a9fd8' },   // metal = cool blue
}

function fmtDay(d: Date) { return d.toISOString().split('T')[0] }
function label(d: Date) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) }

export default function ParkingPage() {
  const [assignments, setAssignments] = useState<any[]>([])
  const [weekStart, setWeekStart] = useState(() => { const d = new Date(); d.setUTCHours(0,0,0,0); return d })
  const [loading, setLoading] = useState(true)

  const DAYS = 14
  const days: Date[] = []
  for (let i = 0; i < DAYS; i++) { const d = new Date(weekStart); d.setUTCDate(d.getUTCDate() + i); days.push(d) }

  function load() {
    setLoading(true)
    const from = fmtDay(days[0]); const to = fmtDay(days[DAYS - 1])
    fetch(`/api/admin/parking?overview=1&from=${from}&to=${to}`).then(r => r.json())
      .then(d => setAssignments(d.assignments || [])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [weekStart])

  // does an assignment occupy a given night? (check-in through night before checkout)
  function occupies(a: any, day: Date) {
    const ds = fmtDay(day)
    return a.start_date <= ds && ds < a.end_date
  }

  const inp: React.CSSProperties = { padding: '6px 12px', background: '#242422', border: '0.5px solid #363634', color: '#AEAEA6', fontSize: '12px', borderRadius: '5px', cursor: 'pointer' }

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '30px', color: '#F0EDE6', margin: '0 0 4px' }}>Parking</h1>
      <p style={{ fontSize: '12px', color: '#9A9A92', marginBottom: '18px' }}>Two lanes in the Royal York driveway. Max two units park per night. Checkout (11am) frees a lane; check-in (4pm) claims it.</p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', alignItems: 'center' }}>
        <button onClick={() => { const d = new Date(weekStart); d.setUTCDate(d.getUTCDate() - DAYS); setWeekStart(d) }} style={inp}>← earlier</button>
        <span style={{ fontSize: '12px', color: '#8A8A82' }}>{label(days[0])} – {label(days[DAYS-1])}</span>
        <button onClick={() => { const d = new Date(weekStart); d.setUTCDate(d.getUTCDate() + DAYS); setWeekStart(d) }} style={inp}>later →</button>
        <button onClick={() => { const d = new Date(); d.setUTCHours(0,0,0,0); setWeekStart(d) }} style={{ ...inp, marginLeft: 'auto' }}>Today</button>
      </div>

      {loading ? <div style={{ color: '#666660', fontSize: '13px' }}>Loading…</div> : (
        <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '10px', padding: '14px', overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `90px repeat(${DAYS}, minmax(52px, 1fr))`, gap: '3px', alignItems: 'center', minWidth: '760px' }}>
            <span></span>
            {days.map((d, i) => (
              <span key={i} style={{ textAlign: 'center', fontSize: '10px', color: fmtDay(d) === fmtDay(new Date(new Date().setUTCHours(0,0,0,0))) ? 'var(--amber)' : '#8A8A82' }}>
                {d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })}
              </span>
            ))}

            {[1, 2].map(lane => (
              <div key={lane} style={{ display: 'contents' }}>
                <span style={{ fontSize: '11px', color: LANE_COLOR[lane].fg }}>{LANE_NAMES[lane]}</span>
                {days.map((d, i) => {
                  const a = assignments.find(x => x.lane === lane && occupies(x, d))
                  if (a) {
                    return (
                      <div key={i} title={`${a.guest_name || 'Booking'} · ${a.car_count} car${a.car_count > 1 ? 's' : ''}`}
                        style={{ background: LANE_COLOR[lane].bg, color: LANE_COLOR[lane].fg, borderRadius: '4px', padding: '6px 4px', fontSize: '9px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {(a.guest_name || '—').split(' ')[0]}{a.car_count > 1 ? ' ··' : ''}
                      </div>
                    )
                  }
                  return <div key={i} style={{ border: '0.5px dashed #363634', borderRadius: '4px', padding: '6px 4px', fontSize: '9px', textAlign: 'center', color: '#4A4A48' }}>free</div>
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <p style={{ fontSize: '11px', color: '#666660', marginTop: '12px' }}>Wooden fence is East's preferred lane, Metal fence is West's — but either unit takes whichever is free. "··" marks two cars in one lane.</p>
    </div>
  )
}
