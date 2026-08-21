'use client'
import { useState, useEffect } from 'react'
import { L, F, microLabel, cardStyle, money } from '@/lib/design-tokens'

const PROPS = [
  { id: 'nickel-beach', name: 'Nickel Beach', note: 'Port Colborne · 4%' },
  { id: 'royal-york-west', name: 'Royal York West', note: 'Toronto' },
  { id: 'royal-york-east', name: 'Royal York East', note: 'Toronto' },
]
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']
const DUE: Record<string, string> = { Q1: 'Apr 15', Q2: 'Jul 15', Q3: 'Oct 15', Q4: 'Jan 15' }

const pill = (on: boolean): React.CSSProperties => ({
  padding: '8px 13px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer',
  background: on ? L.ink : L.card, color: on ? '#fff' : L.ink,
  border: on ? '1px solid transparent' : `1px solid ${L.line}`,
  fontWeight: on ? 600 : 400,
})

export default function MatReturnPage() {
  const [property, setProperty] = useState('nickel-beach')
  const [year, setYear] = useState(2026)
  const [quarter, setQuarter] = useState('Q3')
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/mat-return?property=${property}&year=${year}&quarter=${quarter}`)
      .then(r => r.json()).then(setD).catch(() => {}).finally(() => setLoading(false))
  }, [property, year, quarter])

  const t = d?.totals
  const prop = PROPS.find(p => p.id === property)!

  return (
    <div style={{ paddingTop: '24px' }}>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '20px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <span style={{ fontFamily: F.serif, fontSize: '36px', lineHeight: 1 }}>MAT return · {quarter} {year}</span>
          <span style={{ fontSize: '14px', color: L.inkBody }}>
            {prop.name} · {prop.note} on accommodation only · stays over 29 nights exempt
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {PROPS.map(p => (
            <button key={p.id} onClick={() => setProperty(p.id)} style={pill(property === p.id)}>{p.name}</button>
          ))}
          <span style={{ width: '1px', height: '22px', background: L.line }} />
          {[2025, 2026].map(y => <button key={y} onClick={() => setYear(y)} style={pill(year === y)}>{y}</button>)}
          <span style={{ width: '1px', height: '22px', background: L.line }} />
          {QUARTERS.map(q => <button key={q} onClick={() => setQuarter(q)} style={pill(quarter === q)}>{q}</button>)}
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: '14px', color: L.inkMuted }}>Reading bookings…</div>
      ) : !t ? (
        <div style={{ fontSize: '14px', color: L.red }}>Could not load the return.</div>
      ) : (
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

        <div style={{ flex: '1 1 620px', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

          {/* the three figures */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '14px' }}>
            <div style={{ background: L.inkCard, borderRadius: '16px', padding: '22px', color: L.onInk, display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={{ ...microLabel, color: 'oklch(0.75 0.02 80)' }}>MAT owed</span>
              <span style={{ fontFamily: F.serif, fontSize: '36px', lineHeight: 1.05 }}>{money(t.matOwed)}</span>
              <span style={{ fontSize: '12px', color: L.onInkFaint }}>{d.range.from} → {d.range.to} · file by {DUE[quarter]}</span>
            </div>
            <div style={{ ...cardStyle, padding: '22px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={microLabel}>Room revenue</span>
              <span style={{ fontFamily: F.serif, fontSize: '30px', lineHeight: 1.05 }}>{money(t.roomRevenue)}</span>
              <span style={{ fontSize: '12px', color: L.inkMuted }}>{t.nights} nights · {t.bookingCount} bookings</span>
            </div>
            <div style={{ ...cardStyle, border: `1px solid ${t.gap > 0.005 ? L.redLine : L.line}`, padding: '22px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={microLabel}>Actually collected</span>
              <span style={{ fontFamily: F.serif, fontSize: '30px', lineHeight: 1.05, color: t.gap > 0.005 ? L.red : L.ink }}>{money(t.collected)}</span>
              <span style={{ fontSize: '12px', color: t.gap > 0.005 ? L.red : L.inkMuted }}>
                {t.gap > 0.005 ? `${money(t.gap)} short — you absorb it` : 'matches what is owed'}
              </span>
            </div>
          </div>

          {/* by month — the shape the filing asks for */}
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', background: L.cardAlt, borderBottom: `1px solid ${L.lineSoft}` }}>
              <span style={{ ...microLabel, letterSpacing: '0.12em', color: L.inkFaint }}>By month — the shape the return asks for</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.6fr 1fr 0.8fr 1fr', padding: '10px 20px', borderBottom: `1px solid ${L.lineFaint}`, ...microLabel, letterSpacing: '0.1em' }}>
              <span>Month</span><span style={{ textAlign: 'right' }}>Nights</span><span style={{ textAlign: 'right' }}>Room revenue</span><span style={{ textAlign: 'right' }}>Exempt</span><span style={{ textAlign: 'right' }}>MAT owed</span>
            </div>
            {d.months.map((m: any) => (
              <div key={m.month} style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.6fr 1fr 0.8fr 1fr', padding: '12px 20px', borderBottom: `1px solid ${L.lineFaint}`, fontSize: '13px' }}>
                <span>{m.month}</span>
                <span style={{ textAlign: 'right', fontFamily: F.mono }}>{m.nights}</span>
                <span style={{ textAlign: 'right', fontFamily: F.mono }}>{money(m.roomRevenue)}</span>
                <span style={{ textAlign: 'right', color: m.exemptRevenue ? L.ink : 'oklch(0.60 0.01 60)', fontFamily: m.exemptRevenue ? F.mono : F.sans }}>{m.exemptRevenue ? money(m.exemptRevenue) : '—'}</span>
                <span style={{ textAlign: 'right', fontFamily: F.mono }}>{money(m.matOwed)}</span>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.6fr 1fr 0.8fr 1fr', padding: '13px 20px', background: 'oklch(0.978 0.004 85)', fontSize: '13px', fontWeight: 600 }}>
              <span>Quarter</span>
              <span style={{ textAlign: 'right', fontFamily: F.mono }}>{t.nights}</span>
              <span style={{ textAlign: 'right', fontFamily: F.mono }}>{money(t.roomRevenue)}</span>
              <span style={{ textAlign: 'right', color: 'oklch(0.60 0.01 60)' }}>—</span>
              <span style={{ textAlign: 'right', fontFamily: F.mono }}>{money(t.matOwed)}</span>
            </div>
          </div>

          {/* bookings */}
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', background: L.cardAlt, borderBottom: `1px solid ${L.lineSoft}`, display: 'flex', alignItems: 'baseline', gap: '10px' }}>
              <span style={{ ...microLabel, letterSpacing: '0.12em', color: L.inkFaint }}>Bookings · {t.bookingCount}</span>
              {(t.shortCount > 0 || t.missingCount > 0) && (
                <span style={{ marginLeft: 'auto', fontSize: '12px', color: L.red }}>
                  {t.shortCount > 0 && `${t.shortCount} collected less than owed`}
                  {t.shortCount > 0 && t.missingCount > 0 && ' · '}
                  {t.missingCount > 0 && `${t.missingCount} with no MAT recorded`}
                </span>
              )}
            </div>
            {d.rows.map((r: any) => {
              const flag = r.exempt ? 'exempt' : r.matStored == null ? 'missing' : r.shortfall > 0.005 ? 'short' : r.shortfall < -0.005 ? 'over' : 'ok'
              return (
                <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.7fr 1.5fr 0.5fr 1fr 1.3fr', padding: '11px 20px', borderBottom: `1px solid ${L.lineFaint}`, fontSize: '13px', alignItems: 'center', background: flag === 'short' || flag === 'missing' ? L.redWash : 'transparent' }}>
                  <span style={{ fontWeight: 600 }}>{r.guest}</span>
                  <span style={{ fontFamily: F.mono, fontSize: '10px', color: L.inkMuted, textTransform: 'uppercase' }}>{r.platform}</span>
                  <span style={{ color: L.inkBody }}>{r.start} → {r.end}</span>
                  <span style={{ textAlign: 'right', fontFamily: F.mono }}>{r.nights}</span>
                  <span style={{ textAlign: 'right', fontFamily: F.mono }}>{money(r.room)}</span>
                  <span style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontFamily: F.mono }}>{r.exempt ? '—' : money(r.matOwed)}</span>
                    {flag === 'short' && <span style={{ fontSize: '11px', color: L.red }}>collected {money(r.matStored)} · short {money(r.shortfall)}</span>}
                    {flag === 'over' && <span style={{ fontSize: '11px', color: L.amber }}>collected {money(r.matStored)} · over {money(Math.abs(r.shortfall))}</span>}
                    {flag === 'missing' && <span style={{ fontSize: '11px', color: L.red }}>no MAT recorded</span>}
                    {flag === 'exempt' && <span style={{ fontSize: '11px', color: L.inkMuted }}>{r.exemptReason}</span>}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* right column */}
        <div style={{ width: '330px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ ...cardStyle, borderRadius: '18px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>Filing</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <div style={{ display: 'flex' }}><span style={{ color: L.inkMuted }}>Period</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{quarter} {year}</span></div>
              <div style={{ display: 'flex' }}><span style={{ color: L.inkMuted }}>Due</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{DUE[quarter]}</span></div>
              <div style={{ display: 'flex' }}><span style={{ color: L.inkMuted }}>Rate</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{(d.rate * 100).toFixed(1)}% on room</span></div>
            </div>
            <span style={{ padding: '12px 18px', borderRadius: '11px', background: L.ink, color: '#fff', fontSize: '14px', fontWeight: 600, textAlign: 'center' }}>Export the return</span>
          </div>

          {t.gap > 0.005 && (
            <div style={{ ...cardStyle, border: `1px solid ${L.redLine}`, borderRadius: '18px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600 }}>The {money(t.gap)} gap</span>
              <span style={{ fontSize: '13px', color: L.inkBody, lineHeight: 1.55 }}>
                {t.shortCount > 0 && `${t.shortCount} booking${t.shortCount === 1 ? '' : 's'} collected less MAT than ${prop.name} requires. `}
                {t.missingCount > 0 && `${t.missingCount} ${t.missingCount === 1 ? 'has' : 'have'} no MAT recorded at all. `}
                You remit what is owed either way — the difference comes out of your pocket.
              </span>
            </div>
          )}

          <div style={{ ...cardStyle, borderRadius: '18px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>Not counted here</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', fontSize: '13px', color: L.inkBody }}>
              <span>· Direct bookings — they live in a different table and default to no tax</span>
              <span>· Cleaning, extras and taxes — MAT is room revenue only</span>
              <span>· Stays over 29 nights, and anything with tax switched off</span>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
