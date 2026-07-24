'use client'
import { useState, useEffect } from 'react'

const money = (v: any) => v === null || v === undefined ? '—' : '$' + Number(v).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function MatPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [quarter, setQuarter] = useState('Q' + (Math.floor(now.getMonth() / 3) + 1))
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/mat-report?year=${year}&quarter=${quarter}`)
      .then(r => r.json()).then(setData).finally(() => setLoading(false))
  }, [year, quarter])

  const card: React.CSSProperties = { background: '#242422', border: '0.5px solid #363634', borderRadius: '6px' }
  const btn = (active: boolean): React.CSSProperties => ({ padding: '7px 14px', background: active ? 'var(--amber)' : '#242422', color: active ? '#242422' : '#AEAEA6', border: '0.5px solid #363634', borderRadius: '6px', fontSize: '12px', fontWeight: active ? 600 : 400, cursor: 'pointer' })
  const missing = (data?.bookings || []).filter((b: any) => b.missing_accommodation).length

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '30px', color: '#F0EDE6', margin: '0 0 4px' }}>MAT Return</h1>
      <p style={{ fontSize: '12px', color: '#9A9A92', marginBottom: '18px' }}>
        Nickel Beach · 4% on accommodation only · platform bookings · stays over 29 nights exempt
      </p>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {[year - 1, year, year + 1].map(y => <button key={y} onClick={() => setYear(y)} style={btn(y === year)}>{y}</button>)}
        <span style={{ width: '12px' }} />
        {['Q1', 'Q2', 'Q3', 'Q4'].map(q => <button key={q} onClick={() => setQuarter(q)} style={btn(q === quarter)}>{q}</button>)}
      </div>

      {loading && <div style={{ color: '#666660', fontSize: '13px' }}>Loading…</div>}

      {data && !loading && (
        <>
          <div style={{ ...card, padding: '18px', marginBottom: '16px' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--amber)', marginBottom: '4px' }}>{data.quarter} {data.year} · {data.from} to {data.to}</div>
            <div style={{ display: 'flex', gap: '32px', alignItems: 'baseline', flexWrap: 'wrap', marginTop: '10px' }}>
              <div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: '30px', fontWeight: 300, color: 'var(--amber)' }}>{money(data.total_mat_due)}</div>
                <div style={{ fontSize: '10px', color: '#8A8A82' }}>MAT owed</div>
              </div>
              <div>
                <div style={{ fontSize: '18px', color: '#F0EDE6' }}>{money(data.total_room_revenue)}</div>
                <div style={{ fontSize: '10px', color: '#8A8A82' }}>Room revenue</div>
              </div>
              <div>
                <div style={{ fontSize: '18px', color: '#AEAEA6' }}>{money(data.total_mat_recorded)}</div>
                <div style={{ fontSize: '10px', color: '#8A8A82' }}>MAT recorded on bookings</div>
              </div>
            </div>
            {missing > 0 && <div style={{ marginTop: '12px', fontSize: '11px', color: '#e6a86a' }}>⚠️ {missing} booking{missing === 1 ? '' : 's'} missing an accommodation figure — the total is understated until those are filled in.</div>}
          </div>

          <div style={{ ...card, marginBottom: '16px', overflowX: 'auto' }}>
            <div style={{ padding: '12px 14px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.1em', color: '#9A9A92', borderBottom: '0.5px solid #363634' }}>By month — as ORHMA requires</div>
            <div style={{ minWidth: '520px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr 1fr 1fr 1fr', gap: '8px', padding: '8px 14px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.1em', color: '#666660' }}>
                <span>Month</span><span>Nights</span><span>Room revenue</span><span>Exempt</span><span style={{ textAlign: 'right' }}>MAT owed</span>
              </div>
              {data.months.map((m: any) => (
                <div key={m.month} style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr 1fr 1fr 1fr', gap: '8px', padding: '10px 14px', fontSize: '12px', color: '#AEAEA6', borderTop: '0.5px solid #2A2A28' }}>
                  <span style={{ color: '#F0EDE6' }}>{m.month}</span>
                  <span>{m.nights_occupied}</span>
                  <span>{money(m.room_revenue)}</span>
                  <span>{m.exempt_revenue ? money(m.exempt_revenue) : '—'}</span>
                  <span style={{ textAlign: 'right', color: '#F0EDE6' }}>{money(m.mat_due)}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...card, overflowX: 'auto' }}>
            <div style={{ padding: '12px 14px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.1em', color: '#9A9A92', borderBottom: '0.5px solid #363634' }}>Bookings ({data.bookings.length})</div>
            <div style={{ minWidth: '720px' }}>
              {data.bookings.length === 0 && <div style={{ padding: '16px 14px', fontSize: '13px', color: '#666660' }}>No platform bookings in this quarter.</div>}
              {data.bookings.map((b: any, i: number) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr .7fr 1.2fr .7fr 1fr 1fr', gap: '8px', padding: '10px 14px', fontSize: '12px', color: '#AEAEA6', borderTop: '0.5px solid #2A2A28' }}>
                  <span style={{ color: '#F0EDE6' }}>{b.guest}{b.missing_accommodation && <span title="No accommodation figure recorded" style={{ marginLeft: '5px' }}>⚠️</span>}</span>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase' }}>{b.platform}</span>
                  <span style={{ fontSize: '11px' }}>{b.stay}</span>
                  <span>{b.nights_in_quarter}{b.nights_in_quarter !== b.total_nights ? ` / ${b.total_nights}` : ''}</span>
                  <span>{money(b.room_revenue)}</span>
                  <span style={{ textAlign: 'right', color: b.exempt ? '#666660' : '#F0EDE6' }}>
                    {b.exempt ? 'exempt' : money(b.mat_due)}
                    {b.variance !== null && Math.abs(b.variance) > 0.5 && (
                      <span style={{ display: 'block', fontSize: '9px', color: b.variance > 0 ? '#8A7A5A' : '#c47b7b' }}>
                        collected {money(b.mat_collected_est)} · {b.variance > 0 ? 'over' : 'under'} {money(Math.abs(b.variance))}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
