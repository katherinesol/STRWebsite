'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, addMonths, subMonths } from 'date-fns'
import { L, F, cardStyle, money, platformColour } from '@/lib/design-tokens'
import { getCheckInDisplay, getCheckOutDisplay } from '@/lib/checkin-times'

// Stays · Month, built to turn 4a of the Keyholder design doc.
//
// One property at a time. A stay is a coloured bar in the platform's own colour,
// and the shape of the bar says what happens that day: a bar rounded on its right
// edge and hugging the left half is a departure, the mirror is an arrival, both in
// one cell is a turnover. The mono line underneath is the operational fact — how
// many hours until the next check-in, or that the guest hasn't paid.
//
// Read-only. Every write the dark CalendarView had lives elsewhere now.

const PROPERTIES = [
  { id: 'nickel-beach', name: 'Nickel Beach' },
  { id: 'royal-york-west', name: 'Royal York West' },
  { id: 'royal-york-east', name: 'Royal York East' },
]
const FULL_NAME: Record<string, string> = {
  'nickel-beach': 'Nickel Beach', 'royal-york-west': 'Royal York West', 'royal-york-east': 'Royal York East',
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')
const n = (v: any) => Number(v) || 0
const guestName = (b: any) =>
  (Array.isArray(b.guest_info) ? b.guest_info[0]?.name : b.guest_info?.name) || b.guest_name || 'Guest'
const sourceOf = (b: any) => (b.check_in ? 'direct' : String(b.platform || 'manual').toLowerCase())
const startOf = (b: any) => b.check_in || b.start_date
/** Direct bookings live in `bookings`, platform ones in `calendar_blocks`, and they
 *  have separate detail routes. The redesigned detail (doc turn 2a) is not built yet,
 *  so these point at the legacy pages — repoint here when it lands. */
const hrefFor = (b: any) => (b.check_in ? `/admin/bookings/${b.id}` : `/admin/bookings/block/${b.id}`)
const endOf = (b: any) => b.check_out || b.end_date

/** minutes past midnight from an is24 "HH:MM" */
const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0) }

export default function MonthGrid({ bookings, blocks }: { bookings: any[]; blocks: any[] }) {
  const router = useRouter()
  const [month, setMonth] = useState(new Date())
  const [prop, setProp] = useState('nickel-beach')
  const [groups, setGroups] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/admin/stay-groups/all').then(r => r.json()).then(d => {
      const m: Record<string, string> = {}
      for (const x of d.members || []) m[x.booking_id] = x.group_id
      setGroups(m)
    }).catch(() => {})
  }, [])
  const sameStay = (a: any, b: any) => {
    const ga = groups[a?.id], gb = groups[b?.id]
    return !!ga && !!gb && ga === gb
  }

  // every stay at this property, real bookings only (not owner blocks)
  const stays = useMemo(() => [
    ...bookings.filter(b => b.property_id === prop),
    ...blocks.filter(b => b.property_id === prop && b.is_booking),
  ].sort((a, b) => String(startOf(a)).localeCompare(String(startOf(b)))), [bookings, blocks, prop])

  const mStart = startOfMonth(month), mEnd = endOfMonth(month)
  const days = eachDayOfInterval({ start: mStart, end: mEnd })
  const padded = [...Array(mStart.getDay()).fill(null), ...days]
  while (padded.length % 7) padded.push(null)
  const rows = padded.length / 7

  const on = (ds: string) => ({
    covering: stays.filter(s => ds >= startOf(s) && ds < endOf(s)),
    out: stays.filter(s => endOf(s) === ds),
    in: stays.filter(s => startOf(s) === ds),
  })

  /** hours from this checkout to the next arrival at the property */
  function gapAfter(ds: string, leaving: any): number | null {
    const next = stays.filter(s => startOf(s) >= ds).sort((a, b) => String(startOf(a)).localeCompare(String(startOf(b))))[0]
    if (!next) return null
    const outM = mins(getCheckOutDisplay(leaving).is24)
    const inM = mins(getCheckInDisplay(next).is24)
    const dayDiff = Math.round((new Date(startOf(next) + 'T00:00:00Z').getTime() - new Date(ds + 'T00:00:00Z').getTime()) / 86400000)
    const h = Math.round((dayDiff * 24 * 60 + inM - outM) / 60)
    return h > 0 ? h : null
  }

  /** a direct booking with money still outstanding */
  const unpaid = (s: any) => s.check_in && n(s.total) > 0 && n(s.total) > (n(s.deposit_amount) + n(s.second_payment_amount) + n(s.final_payment_amount))

  // first day of each run of empty nights, and how long the run is
  const openRuns = useMemo(() => {
    const m: Record<string, number> = {}
    let i = 0
    while (i < days.length) {
      if (on(iso(days[i])).covering.length || on(iso(days[i])).in.length) { i++; continue }
      let j = i
      while (j < days.length && !on(iso(days[j])).covering.length && !on(iso(days[j])).in.length) j++
      m[iso(days[i])] = j - i
      i = j
    }
    return m
  }, [stays, month]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── month summary for the rail ──────────────────────────────────────────────
  const summary = useMemo(() => {
    const total = days.length
    let booked = 0
    for (const d of days) if (on(iso(d)).covering.length) booked++
    const inMonth = stays.filter(s => endOf(s) > iso(mStart) && startOf(s) <= iso(mEnd))
    const revenue = inMonth.reduce((t, s) => t + (n(s.accommodation) || n(s.total)), 0)
    const payout = inMonth.reduce((t, s) => t + (n(s.payout_amount) || n(s.total) || n(s.accommodation)), 0)
    const mix: Record<string, number> = {}
    for (const s of inMonth) {
      const k = sourceOf(s)
      mix[k] = (mix[k] || 0) + (n(s.payout_amount) || n(s.total) || n(s.accommodation))
    }
    const mixTotal = Object.values(mix).reduce((a, b) => a + b, 0)
    return {
      booked, total,
      occupancy: total ? Math.round((booked / total) * 100) : 0,
      nightly: booked ? Math.round(revenue / booked) : 0,
      payout,
      mix: Object.entries(mix).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => ({ k, v, pct: mixTotal ? Math.round((v / mixTotal) * 100) : 0 })),
      openNights: Object.values(openRuns).reduce((a, b) => a + b, 0),
      unpaidCount: inMonth.filter(unpaid).length,
    }
  }, [stays, month, openRuns]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── styles from the doc ─────────────────────────────────────────────────────
  const seg = (active: boolean): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: '7px', fontSize: '13px', fontFamily: F.sans,
    border: 'none', cursor: 'pointer',
    background: active ? '#fff' : 'transparent',
    color: active ? L.ink : 'oklch(0.50 0.01 60)',
    fontWeight: active ? 600 : 400,
    boxShadow: active ? '0 1px 2px oklch(0.25 0.01 60 / 0.06)' : 'none',
  })
  const pill = (active: boolean): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: '99px', fontSize: '13px', fontFamily: F.sans, cursor: 'pointer',
    border: `1px solid ${active ? L.ink : 'oklch(0.89 0.005 80)'}`,
    background: active ? L.ink : '#fff', color: active ? '#fff' : L.ink,
    fontWeight: active ? 600 : 400,
  })
  const mono9: React.CSSProperties = { padding: '0 8px', fontFamily: F.mono, fontSize: '9px', letterSpacing: '.07em' }
  const barBase: React.CSSProperties = {
    fontSize: '10px', fontWeight: 500, display: 'flex', alignItems: 'center',
    padding: '0 7px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
    border: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: F.sans,
  }
  /** One bar. Clicking opens that booking — the same destination the mobile
   *  agenda has always used, so both halves of the app finally agree. */
  const Bar = ({ stay, shape }: { stay: any; shape: 'full' | 'left' | 'right' }) => {
    const p = platformColour(sourceOf(stay))
    const radius = shape === 'full' ? 0 : shape === 'left' ? '0 7px 7px 0' : '7px 0 0 7px'
    return (
      <button
        onClick={() => router.push(hrefFor(stay))}
        title={`${guestName(stay)} · ${startOf(stay)} → ${endOf(stay)}`}
        style={{ ...barBase, flex: 1, ...(shape === 'full' ? {} : { maxWidth: '50%' }), borderRadius: radius, background: p.bg, color: p.fg }}
      >{guestName(stay)}</button>
    )
  }

  return (
    <div style={{ paddingTop: '30px', display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '4px', padding: '4px', background: 'oklch(0.945 0.005 80)', borderRadius: '10px' }}>
          <button style={seg(false)} title="Not built yet">Timeline</button>
          <button style={seg(true)}>Month</button>
          <button style={seg(false)} title="Not built yet">List</button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {PROPERTIES.map(p => (
            <button key={p.id} onClick={() => setProp(p.id)} style={pill(prop === p.id)}>{p.name}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', fontSize: '11px', color: 'oklch(0.50 0.01 60)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '20px', height: '9px', borderRadius: '0 5px 5px 0', background: 'oklch(0.72 0.02 60)' }} />leaves
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '20px', height: '9px', borderRadius: '5px 0 0 5px', background: 'oklch(0.72 0.02 60)' }} />arrives
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'flex', gap: '3px' }}>
              <span style={{ width: '10px', height: '9px', borderRadius: '0 5px 5px 0', background: 'oklch(0.72 0.02 60)' }} />
              <span style={{ width: '10px', height: '9px', borderRadius: '5px 0 0 5px', background: 'oklch(0.72 0.02 60)' }} />
            </span>same day
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => setMonth(m => subMonths(m, 1))} style={{ background: 'none', border: 'none', fontSize: '15px', color: 'oklch(0.50 0.01 60)', cursor: 'pointer' }}>←</button>
          <span style={{ fontFamily: F.serif, fontSize: '26px', minWidth: '170px', textAlign: 'center' }}>{format(month, 'MMMM yyyy')}</span>
          <button onClick={() => setMonth(m => addMonths(m, 1))} style={{ background: 'none', border: 'none', fontSize: '15px', color: 'oklch(0.50 0.01 60)', cursor: 'pointer' }}>→</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0, alignItems: 'stretch' }}>

        {/* the grid */}
        <div style={{ flex: 1, ...cardStyle, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '760px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: L.cardAlt, borderBottom: `1px solid ${L.lineSoft}` }}>
            {['SUN','MON','TUE','WED','THU','FRI','SAT'].map(d => (
              <span key={d} style={{ padding: '10px 12px', fontFamily: F.mono, fontSize: '10px', letterSpacing: '.12em', color: 'oklch(0.55 0.02 60)' }}>{d}</span>
            ))}
          </div>

          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridTemplateRows: `repeat(${rows},1fr)` }}>
            {padded.map((day, i) => {
              const lastCol = i % 7 === 6
              const lastRow = i >= padded.length - 7
              const edge: React.CSSProperties = {
                borderRight: lastCol ? 'none' : `1px solid ${L.lineFaint}`,
                borderBottom: lastRow ? 'none' : `1px solid ${L.lineFaint}`,
              }
              if (!day) return <div key={`p${i}`} style={{ ...edge, background: 'oklch(0.982 0.004 85)' }} />

              const ds = iso(day)
              const c = on(ds)
              const cont = c.out.length > 0 && c.in.length > 0 && sameStay(c.out[0], c.in[0])
              const turnover = c.out.length > 0 && c.in.length > 0 && !cont
              const staying = c.covering.filter(s => startOf(s) !== ds && endOf(s) !== ds)
              const today = isToday(day)

              let bg = '#fff'
              if (turnover) bg = 'oklch(0.985 0.014 78)'
              else if (today) bg = 'oklch(0.983 0.010 85)'

              // the bar row
              let bar: React.ReactNode = null
              if (turnover) {
                bar = (<>
                  <Bar stay={c.out[0]} shape="left" />
                  <span style={{ flex: 1 }} />
                  <Bar stay={c.in[0]} shape="right" />
                </>)
              } else if (staying.length) {
                bar = <Bar stay={staying[0]} shape="full" />
              } else if (c.out.length) {
                bar = (<><Bar stay={c.out[0]} shape="left" /><span style={{ flex: 1 }} /></>)
              } else if (c.in.length) {
                bar = (<><span style={{ flex: 1 }} /><Bar stay={c.in[0]} shape="right" /></>)
              } else if (openRuns[ds]) {
                bar = <span style={{ flex: 1, border: `1px dashed oklch(0.86 0.005 80)`, borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'oklch(0.52 0.01 60)' }}>open</span>
              }

              // the mono annotation
              let note: React.ReactNode = null
              if (turnover) {
                const o = getCheckOutDisplay(c.out[0]), a = getCheckInDisplay(c.in[0])
                const gap = Math.round((mins(a.is24) - mins(o.is24)) / 60)
                note = <span style={{ ...mono9, color: 'oklch(0.44 0.07 70)' }}>OUT {o.time} → IN {a.time} · {gap}H GAP</span>
              } else if (c.out.length && !staying.length) {
                const o = getCheckOutDisplay(c.out[0])
                const g = gapAfter(ds, c.out[0])
                note = <span style={{ ...mono9, color: 'oklch(0.55 0.01 60)' }}>OUT {o.time}{g ? ` · ${g}H TO NEXT IN` : ''}</span>
              } else if (c.in.length) {
                const a = getCheckInDisplay(c.in[0])
                note = unpaid(c.in[0])
                  ? <span style={{ ...mono9, color: 'oklch(0.52 0.15 28)' }}>IN {a.time} · UNPAID</span>
                  : <span style={{ ...mono9, color: 'oklch(0.55 0.01 60)' }}>IN {a.time}</span>
              } else if (openRuns[ds]) {
                note = <span style={{ ...mono9, color: 'oklch(0.55 0.01 60)' }}>{openRuns[ds]} NIGHT{openRuns[ds] > 1 ? 'S' : ''} OPEN</span>
              }

              return (
                <div key={ds} style={{ ...edge, background: bg, padding: '7px 0', display: 'flex', flexDirection: 'column', gap: '5px', overflow: 'hidden' }}>
                  <span style={{ padding: '0 8px', fontFamily: F.mono, fontSize: '11px', color: today ? 'oklch(0.30 0.05 70)' : 'oklch(0.50 0.01 60)', fontWeight: today ? 600 : 400 }}>
                    {format(day, 'd')}{today ? ' · today' : ''}
                  </span>
                  {turnover && (
                    <span style={{ padding: '0 8px', fontFamily: F.mono, fontSize: '9px', letterSpacing: '.08em', color: 'oklch(0.44 0.07 70)', fontWeight: 500 }}>SAME-DAY TURNOVER</span>
                  )}
                  {bar && <div style={{ display: 'flex', height: '24px', gap: '4px' }}>{bar}</div>}
                  {note}
                </div>
              )
            })}
          </div>
        </div>

        {/* right rail */}
        <div style={{ width: '296px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ ...cardStyle, borderRadius: '18px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>{format(month, 'MMMM')} at {FULL_NAME[prop]}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
              {[
                ['Nights booked', `${summary.booked} of ${summary.total}`],
                ['Occupancy', `${summary.occupancy}%`],
                ['Nightly average', summary.nightly ? `$${summary.nightly.toLocaleString('en-CA')}` : '—'],
                ['Expected payout', summary.payout ? `$${Math.round(summary.payout).toLocaleString('en-CA')}` : '—'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '13px', color: 'oklch(0.52 0.01 60)' }}>{k}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: F.mono, fontSize: '14px' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...cardStyle, borderRadius: '18px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>Where the money comes from</span>
            {summary.mix.length === 0
              ? <span style={{ fontSize: '13px', color: L.inkMuted }}>Nothing booked this month.</span>
              : <>
                  <div style={{ display: 'flex', height: '10px', borderRadius: '99px', overflow: 'hidden' }}>
                    {summary.mix.map(m => <span key={m.k} style={{ width: `${m.pct}%`, background: platformColour(m.k).bg }} />)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                    {summary.mix.map(m => (
                      <div key={m.k} style={{ display: 'flex', alignItems: 'center', gap: '9px', fontSize: '13px' }}>
                        <span style={{ width: '9px', height: '9px', borderRadius: '3px', background: platformColour(m.k).bg }} />
                        <span style={{ textTransform: 'capitalize' }}>{m.k === 'vrbo' ? 'VRBO' : m.k}</span>
                        <span style={{ marginLeft: 'auto', fontFamily: F.mono, color: 'oklch(0.50 0.01 60)' }}>{m.pct}%</span>
                      </div>
                    ))}
                  </div>
                </>}
          </div>

          <div style={{ ...cardStyle, borderRadius: '18px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>Worth a look</span>
            <span style={{ fontSize: '13px', color: 'oklch(0.50 0.01 60)', lineHeight: 1.55, textWrap: 'pretty' as any }}>
              {summary.openNights === 0
                ? `Every night is booked at ${FULL_NAME[prop]} this month.`
                : `${summary.openNights} night${summary.openNights > 1 ? 's' : ''} open this month.`}
              {summary.unpaidCount > 0 && ` ${summary.unpaidCount} direct booking${summary.unpaidCount > 1 ? 's have' : ' has'} money still owing.`}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
