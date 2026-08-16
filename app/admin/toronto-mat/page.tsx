'use client'
import { useState, useEffect } from 'react'

const PROPS = [{ id: 'royal-york-east', name: 'Royal York East' }, { id: 'royal-york-west', name: 'Royal York West' }]
const PLATFORMS = ['airbnb', 'vrbo', 'houfy']
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']

function defaultQuarter() {
  const now = new Date(); const m = now.getMonth()
  // the CURRENT quarter in progress
  const y = now.getFullYear()
  if (m <= 2) return { year: y, quarter: 'Q1' }
  if (m <= 5) return { year: y, quarter: 'Q2' }
  if (m <= 8) return { year: y, quarter: 'Q3' }
  return { year: y, quarter: 'Q4' }
}

export default function TorontoMatPage() {
  const dq = defaultQuarter()
  const [property, setProperty] = useState('royal-york-west')   // Unit 2 — the operating suite
  const [year, setYear] = useState(dq.year)
  const [quarter, setQuarter] = useState(dq.quarter)
  const [platforms, setPlatforms] = useState<string[]>([...PLATFORMS])
  const [report, setReport] = useState<any>(null)
  const [filings, setFilings] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showFile, setShowFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  function loadReport() {
    setLoading(true)
    fetch(`/api/admin/toronto-mat-report?property=${property}&year=${year}&quarter=${quarter}&platforms=${platforms.join(',')}`)
      .then(r => r.json()).then(setReport).finally(() => setLoading(false))
  }
  function loadFilings() {
    fetch(`/api/admin/mat-filings?property=${property}`).then(r => r.json()).then(d => setFilings(d.filings || []))
  }
  useEffect(() => { loadReport(); loadFilings() }, [property, year, quarter, platforms.join(',')])

  function togglePlatform(p: string) {
    setPlatforms(s => s.includes(p) ? s.filter(x => x !== p) : [...s, p])
  }

  async function recordFiling(e: any) {
    e.preventDefault()
    setSaving(true); setMsg('')
    const fd = new FormData(e.target)
    fd.set('property_id', property); fd.set('year', String(year)); fd.set('quarter', quarter)
    fd.set('nights_booked', String(report?.total_nights_in_quarter ?? ''))
    fd.set('room_revenue', String(report?.total_room_revenue ?? ''))
    fd.set('mat_due', String(report?.total_mat_due ?? ''))
    const r = await fetch('/api/admin/mat-filings', { method: 'POST', body: fd }).then(x => x.json())
    setSaving(false)
    if (r.error) { setMsg(r.error); return }
    setMsg('Filing recorded'); setShowFile(false); loadFilings()
  }

  const DUE: Record<string, string> = { Q1: 'April 30', Q2: 'July 30', Q3: 'October 30', Q4: 'January 30' }
  const dueYear = quarter === 'Q4' ? year + 1 : year
  const periodLabel = report ? `${new Date(report.from + 'T00:00:00').toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })} – ${new Date(report.to + 'T00:00:00').toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''
  const existing = filings.find(f => f.year === year && f.quarter === quarter)
  const money = (n: any) => n == null ? '—' : '$' + Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const inp: React.CSSProperties = { padding: '8px 10px', background: '#1E1E1C', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '13px', borderRadius: '4px' }

  return (
    <div style={{ maxWidth: '920px', margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '30px', color: '#F0EDE6', margin: '0 0 4px' }}>Toronto MAT</h1>
      <p style={{ fontSize: '12px', color: '#9A9A92', marginBottom: '18px' }}>Royal York East &amp; West file separately. Room portion only. 8.5% through Jul 31 2026, then 6%. File every quarter even at zero.</p>

      {/* controls */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
        <select value={property} onChange={e => setProperty(e.target.value)} style={inp}>{PROPS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select value={year} onChange={e => setYear(Number(e.target.value))} style={inp}>{[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}</select>
        <select value={quarter} onChange={e => setQuarter(e.target.value)} style={inp}>{QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}</select>
        <div style={{ display: 'flex', gap: '5px', marginLeft: '6px' }}>
          {PLATFORMS.map(p => (
            <button key={p} onClick={() => togglePlatform(p)} style={{ padding: '7px 11px', fontSize: '11px', borderRadius: '5px', border: '0.5px solid ' + (platforms.includes(p) ? 'var(--amber)' : '#4A4A48'), background: platforms.includes(p) ? 'var(--amber)' : '#1E1E1C', color: platforms.includes(p) ? '#242422' : '#8A8A82', cursor: 'pointer', textTransform: 'capitalize' }}>{p}</button>
          ))}
        </div>
      </div>

      {report && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#242422', border: '0.5px solid #363634', borderRadius: '6px', padding: '10px 14px', marginBottom: '12px', fontSize: '12px' }}>
        <span style={{ color: '#AEAEA6' }}>{quarter} {year} · <span style={{ color: '#F0EDE6' }}>{periodLabel}</span></span>
        <span style={{ color: '#e6a86a' }}>Filing due {DUE[quarter]} {dueYear}</span>
      </div>}

      {existing && <div style={{ background: '#1f2a1a', border: '0.5px solid #2f4020', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#7bc47b' }}>✓ Filed {new Date(existing.filed_at).toLocaleDateString('en-CA')}{existing.confirmation_number ? ' · #' + existing.confirmation_number : ''}{existing.file_url ? ' · ' : ''}{existing.file_url && <a href={existing.file_url} target="_blank" style={{ color: '#7bc4c4' }}>view confirmation</a>}</div>}

      {/* totals */}
      {loading ? <div style={{ color: '#666660', fontSize: '13px' }}>Loading…</div> : report && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '18px' }}>
            <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '11px', color: '#8A8A82' }}>Nights booked</div>
              <div style={{ fontSize: '24px', color: '#F0EDE6', fontFamily: 'var(--serif)' }}>{report.total_nights_in_quarter}</div>
            </div>
            <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '11px', color: '#8A8A82' }}>Room revenue</div>
              <div style={{ fontSize: '24px', color: '#F0EDE6', fontFamily: 'var(--serif)' }}>{money(report.total_room_revenue)}</div>
            </div>
            <div style={{ background: '#242422', border: '0.5px solid #4a3a1f', borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '11px', color: '#e6a86a' }}>MAT due</div>
              <div style={{ fontSize: '24px', color: 'var(--amber)', fontFamily: 'var(--serif)' }}>{money(report.total_mat_due)}</div>
            </div>
          </div>

          {/* per-booking */}
          <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '8px', overflow: 'hidden', marginBottom: '18px' }}>
            <div style={{ padding: '10px 14px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.08em', color: '#9A9A92', borderBottom: '0.5px solid #363634' }}>Bookings this quarter · {report.bookings.length}</div>
            {report.bookings.length === 0 && <div style={{ padding: '16px 14px', fontSize: '13px', color: '#666660' }}>No bookings — but you still file a zero report.</div>}
            {report.bookings.map((b: any, i: number) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr auto auto', gap: '10px', padding: '10px 14px', borderTop: '0.5px solid #2A2A28', fontSize: '12px', alignItems: 'center' }}>
                <div><span style={{ color: '#F0EDE6' }}>{b.guest}</span> <span style={{ color: '#8A8A82' }}>· {b.platform}</span>{b.exempt && <span style={{ color: '#7bc4c4', marginLeft: '6px', fontSize: '10px' }}>28+ exempt</span>}{b.missing_accommodation && <span style={{ color: '#e57373', marginLeft: '6px', fontSize: '10px' }}>no $ recorded</span>}</div>
                <div style={{ color: '#8A8A82' }}>{b.stay}</div>
                <div style={{ color: '#AEAEA6', textAlign: 'right' }}>{b.nights_in_quarter}n · {money(b.room_revenue)}</div>
                <div style={{ color: 'var(--amber)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(b.mat_due)}</div>
              </div>
            ))}
          </div>

          {/* record filing */}
          {!showFile ? (
            <button onClick={() => setShowFile(true)} style={{ padding: '10px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '6px' }}>{existing ? 'Update filing record' : 'Record this filing'}</button>
          ) : (
            <form onSubmit={recordFiling} style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '8px', padding: '18px' }}>
              <div style={{ fontSize: '13px', color: '#F0EDE6', marginBottom: '12px' }}>Record {quarter} {year} filing — {PROPS.find(p => p.id === property)?.name}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', color: '#9A9A92' }}>Confirmation number<input name="confirmation_number" style={{ ...inp, width: '100%', marginTop: '3px' }} /></label>
                <label style={{ fontSize: '11px', color: '#9A9A92' }}>MAT remitted<input name="mat_remitted" defaultValue={report.total_mat_due} style={{ ...inp, width: '100%', marginTop: '3px' }} /></label>
              </div>
              <label style={{ fontSize: '11px', color: '#9A9A92', display: 'block', marginBottom: '10px' }}>Confirmation document (PDF or image)<input name="file" type="file" accept=".pdf,image/*" style={{ ...inp, width: '100%', marginTop: '3px' }} /></label>
              <label style={{ fontSize: '11px', color: '#9A9A92', display: 'block', marginBottom: '12px' }}>Notes<input name="notes" style={{ ...inp, width: '100%', marginTop: '3px' }} /></label>
              {msg && <div style={{ fontSize: '12px', color: msg === 'Filing recorded' ? '#7bc47b' : '#e6a86a', marginBottom: '10px' }}>{msg}</div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" disabled={saving} style={{ padding: '9px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '6px' }}>{saving ? 'Saving…' : 'Save filing'}</button>
                <button type="button" onClick={() => setShowFile(false)} style={{ padding: '9px 16px', background: '#363634', color: '#9A9A92', border: 'none', fontSize: '12px', cursor: 'pointer', borderRadius: '6px' }}>Cancel</button>
              </div>
            </form>
          )}

          {/* filing history */}
          {filings.length > 0 && (
            <div style={{ marginTop: '22px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.08em', color: '#8A8A82', marginBottom: '8px' }}>Filing history · {PROPS.find(p => p.id === property)?.name}</div>
              <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '8px', overflow: 'hidden' }}>
                {filings.map(f => (
                  <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', borderTop: '0.5px solid #2A2A28', fontSize: '12px' }}>
                    <div style={{ color: '#F0EDE6' }}>{f.quarter} {f.year} <span style={{ color: '#8A8A82', marginLeft: '8px' }}>{money(f.mat_remitted)} remitted{f.confirmation_number ? ' · #' + f.confirmation_number : ''}</span></div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <span style={{ color: '#666660', fontSize: '11px' }}>{f.filed_at ? new Date(f.filed_at).toLocaleDateString('en-CA') : ''}</span>
                      {f.file_url && <a href={f.file_url} target="_blank" style={{ color: '#7bc4c4', fontSize: '11px' }}>document</a>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
