'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { L, F, microLabel, cardStyle, money, platformColour } from '@/lib/design-tokens'

/* Reservation revenue, and only that.
 *
 *  Money that never touched a booking — resolution-centre fees, damage
 *  recoveries — is deliberately absent. It belongs to the combined P&L in the
 *  backlog, which is also where the warning lives that a P&L drawn from
 *  bookings alone would silently omit it.
 *
 *  READ ONLY, on purpose. The legacy /admin/income screen let you type hst and
 *  mat straight onto a booking through /api/admin/income/update, which skips the
 *  tax engine, the guest link and the payout check — the exact path that once
 *  left a $1,038 payout invisible to every report. Corrections belong on the
 *  booking, through its figures panel. Here you look, and you follow the link. */

const PROP_NAMES: Record<string, string> = {
  'nickel-beach': 'Nickel Beach',
  'royal-york-west': 'Royal York West',
  'royal-york-east': 'Royal York East',
  'royal-york': 'Royal York',
}
const propName = (p: string | null) => (p ? PROP_NAMES[p] || p : 'No property')

const pill = (on: boolean): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer',
  background: on ? L.ink : L.card, color: on ? '#fff' : L.ink,
  border: on ? '1px solid transparent' : `1px solid ${L.line}`,
  fontWeight: on ? 600 : 400, fontFamily: F.sans,
})

const num = (v: any) => (v == null ? 0 : Number(v) || 0)

export default function IncomePage() {
  const [rows, setRows] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [year, setYear] = useState('2026')
  const [property, setProperty] = useState('')
  const [platform, setPlatform] = useState('')

  useEffect(() => {
    fetch('/api/admin/income')
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`); return r.json() })
      .then(d => setRows(d.rows || d))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => (rows || []).filter(r => {
    if (year && !String(r.check_in || '').startsWith(year)) return false
    if (property && r.property_id !== property) return false
    if (platform && String(r.platform).toLowerCase() !== platform) return false
    return true
  }), [rows, year, property, platform])

  const t = useMemo(() => {
    const income = filtered.reduce((s, r) => s + num(r.payout), 0)
    const direct = filtered.filter(r => r.source === 'direct').reduce((s, r) => s + num(r.payout), 0)
    const collected = filtered.reduce((s, r) => s + num(r.tax_collected), 0)
    const owed = filtered.reduce((s, r) => s + num(r.hst) + num(r.mat), 0)
    return {
      income, direct, platform: income - direct, collected, owed, gap: Math.round((collected - owed) * 100) / 100,
      count: filtered.length,
      flagged: filtered.filter(r => (r.flags || []).length).length,
    }
  }, [filtered])

  const platforms = useMemo(
    () => [...new Set((rows || []).map(r => String(r.platform).toLowerCase()))].sort(),
    [rows])
  const years = useMemo(
    () => [...new Set((rows || []).map(r => String(r.check_in || '').slice(0, 4)).filter(Boolean))].sort().reverse(),
    [rows])

  const col = '92px 1.6fr 1fr 92px 110px 110px 120px'

  return (
    <div style={{ paddingTop: '24px' }}>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '24px', marginBottom: '22px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <span style={{ fontFamily: F.serif, fontSize: '40px', lineHeight: 1 }}>Income</span>
          <span style={{ fontSize: '15px', color: L.inkBody }}>
            {loading ? 'Reading bookings…'
              : err ? `Could not load income — ${err}`
              : t.count === 0 ? 'No bookings match these filters.'
              : `${money(t.income)} across ${t.count} booking${t.count === 1 ? '' : 's'}${t.flagged ? ` · ${t.flagged} need attention` : ''}`}
          </span>
        </div>
      </div>

      {!loading && !err && (
        <>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
            {years.map(y => <button key={y} onClick={() => setYear(y)} style={pill(year === y)}>{y}</button>)}
            <span style={{ width: '1px', height: '22px', background: L.line }} />
            <button onClick={() => setProperty('')} style={pill(property === '')}>All properties</button>
            {Object.keys(PROP_NAMES).slice(0, 3).map(p =>
              <button key={p} onClick={() => setProperty(p)} style={pill(property === p)}>{PROP_NAMES[p]}</button>)}
            <span style={{ width: '1px', height: '22px', background: L.line }} />
            <button onClick={() => setPlatform('')} style={pill(platform === '')}>All sources</button>
            {platforms.map(p => <button key={p} onClick={() => setPlatform(p)} style={pill(platform === p)}>{p}</button>)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '14px', marginBottom: '22px' }}>
            <div style={{ background: L.inkCard, borderRadius: '16px', padding: '22px', color: L.onInk, display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={{ ...microLabel, color: 'oklch(0.75 0.02 80)' }}>Received</span>
              <span style={{ fontFamily: F.serif, fontSize: '36px', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{money(t.income)}</span>
              <span style={{ fontSize: '12px', color: L.onInkFaint }}>{t.count} bookings · {year}</span>
            </div>
            <div style={{ ...cardStyle, padding: '22px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={microLabel}>Direct · platform</span>
              <span style={{ fontFamily: F.serif, fontSize: '30px', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
                {money(t.direct)}
              </span>
              <span style={{ fontSize: '12px', color: L.inkMuted }}>{money(t.platform)} through platforms</span>
            </div>
            <div style={{ ...cardStyle, border: `1px solid ${Math.abs(t.gap) > 0.005 ? L.redLine : L.line}`, padding: '22px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={microLabel}>Tax collected vs owed</span>
              <span style={{ fontFamily: F.serif, fontSize: '30px', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', color: t.gap < -0.005 ? L.red : L.ink }}>
                {money(t.collected)}
              </span>
              <span style={{ fontSize: '12px', color: t.gap < -0.005 ? L.red : L.inkMuted }}>
                {Math.abs(t.gap) < 0.005 ? `matches the ${money(t.owed)} owed`
                  : t.gap < 0 ? `${money(Math.abs(t.gap))} short of the ${money(t.owed)} owed`
                  : `${money(t.gap)} over the ${money(t.owed)} owed`}
              </span>
            </div>
          </div>

          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', background: L.cardAlt, borderBottom: `1px solid ${L.lineSoft}` }}>
              <span style={{ ...microLabel, letterSpacing: '0.12em' }}>Every booking · newest first</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: '860px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: col, padding: '10px 20px', borderBottom: `1px solid ${L.lineFaint}`, ...microLabel, letterSpacing: '0.1em' }}>
                  <span>Check-in</span><span>Guest</span><span>Property</span><span>Source</span>
                  <span style={{ textAlign: 'right' }}>Room</span>
                  <span style={{ textAlign: 'right' }}>Tax collected</span>
                  <span style={{ textAlign: 'right' }}>Received</span>
                </div>
                {!filtered.length ? (
                  <div style={{ padding: '28px 20px', fontSize: '14px', color: L.inkMuted }}>No bookings match these filters.</div>
                ) : filtered.map(r => {
                  const c = platformColour(r.platform)
                  const href = r.source === 'direct' ? `/keyholder/stays/booking/${r.id}` : `/keyholder/stays/block/${r.id}`
                  return (
                    <Link key={`${r.source}-${r.id}`} href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: col, padding: '13px 20px', borderBottom: `1px solid ${L.lineFaint}`, alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', color: L.inkBody, fontVariantNumeric: 'tabular-nums' }}>{r.check_in}</span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ fontSize: '14px', color: L.ink, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.guest_name}</span>
                          {!!(r.flags || []).length && (
                            <span style={{ fontSize: '11px', color: L.red }}>{r.flags.join(' · ')}</span>
                          )}
                        </span>
                        <span style={{ fontSize: '13px', color: L.inkMuted }}>{propName(r.property_id)}</span>
                        <span>
                          <span style={{ background: c.bg, color: c.fg, fontSize: '10px', fontFamily: F.mono, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: '99px' }}>{r.platform}</span>
                        </span>
                        <span style={{ textAlign: 'right', fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: L.inkBody }}>{money(r.accommodation)}</span>
                        <span style={{ textAlign: 'right', fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: r.tax_collected == null ? L.red : L.inkBody }}>
                          {r.tax_collected == null ? 'none' : money(r.tax_collected)}
                        </span>
                        <span style={{ textAlign: 'right', fontSize: '14px', fontVariantNumeric: 'tabular-nums', color: L.ink, fontWeight: 500 }}>{money(r.payout)}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>

          <p style={{ fontSize: '12px', color: L.inkFaint, marginTop: '14px', maxWidth: '620px' }}>
            Figures are corrected on the booking itself, where the tax engine and the
            payout check run. This page only reports them.
          </p>
        </>
      )}
    </div>
  )
}
