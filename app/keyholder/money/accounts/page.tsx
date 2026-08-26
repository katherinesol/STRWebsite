'use client'
import { useState, useEffect } from 'react'
import { L, F, microLabel, cardStyle, money } from '@/lib/design-tokens'

/*  Accounts — money by account, read only. See app/api/admin/accounts/route.ts
 *  for why the three buckets are kept apart and why every figure here is a
 *  movement rather than a balance. */

const pill = (on: boolean): React.CSSProperties => ({
  padding: '8px 13px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer',
  background: on ? L.ink : L.card, color: on ? '#fff' : L.ink,
  border: on ? '1px solid transparent' : `1px solid ${L.line}`,
  fontWeight: on ? 600 : 400,
})
const num: React.CSSProperties = { fontFamily: F.mono, fontVariantNumeric: 'tabular-nums' }
const signed = (v: number) => (v < 0 ? '−' : '') + money(Math.abs(v))
const monthName = (m: string) =>
  new Date(m + '-02T12:00:00').toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })

export default function AccountsPage() {
  const [year, setYear] = useState('2026')
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [pick, setPick] = useState<string>('')
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    fetch(`/api/admin/accounts?year=${year}`)
      .then(r => r.json()).then(setD).catch(() => {}).finally(() => setLoading(false))
  }

  async function assign(paymentId: string) {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}/assign`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account_id: pick, reference: ref.trim() || null }),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.detail || j.error || 'Could not assign'); return }
      setAssigning(null); setPick(''); setRef('')
      reload()   // the row leaves ⚠ Unrecorded and joins its account
    } catch (e: any) { setErr(e?.message || 'Could not assign') }
    finally { setBusy(false) }
  }

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/accounts?year=${year}`)
      .then(r => r.json()).then(setD).catch(() => {}).finally(() => setLoading(false))
  }, [year])

  const accounts = d?.accounts || []
  const drill = open ? (d?.payments || []).filter((p: any) => p.account_id === open) : []
  const openAcct = accounts.find((a: any) => a.id === open)

  return (
    <div style={{ paddingTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap', marginBottom: '6px' }}>
        <span style={{ fontFamily: F.serif, fontSize: '36px', lineHeight: 1 }}>Accounts</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['2026', 'all'].concat((d?.years || []).filter((y: string) => y !== '2026')).filter((v, i, a) => a.indexOf(v) === i).map((y: string) => (
            <button key={y} onClick={() => setYear(y)} style={pill(year === y)}>{y === 'all' ? 'All time' : y}</button>
          ))}
        </div>
      </div>

      {/* The one sentence that stops these numbers being read as a bank balance. */}
      <p style={{ fontSize: '13px', color: L.inkBody, marginBottom: '22px', maxWidth: '640px', lineHeight: 1.5 }}>
        Movement, not balance — money that moved in this window. There are no opening
        balances, so these totals are not a position and will not reconcile to a statement.
      </p>

      {!loading && d?.staleness?.count > 0 && (
        <div style={{ ...cardStyle, padding: '14px 18px', marginBottom: '18px',
          background: L.amberWash, border: `1px solid ${L.amberLine}` }}>
          <div style={{ ...microLabel, color: L.amber, marginBottom: '3px' }}>Not everything is here yet</div>
          <div style={{ fontSize: '13px', color: L.inkBody, lineHeight: 1.5 }}>
            <strong>{d.staleness.count} payment{d.staleness.count === 1 ? '' : 's'}</strong>{' '}
            ({money(d.staleness.total)}) logged since this view was built {d.staleness.count === 1 ? 'is' : 'are'} not
            included. Invoice payments are still recorded separately, so anything logged there
            after the migration will not appear on this page until the two are joined up.
          </div>
        </div>
      )}

      {loading && <div style={{ fontSize: '13px', color: L.inkFaint }}>Loading…</div>}

      {!loading && d && (
        <>
          {/* ── account cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            {accounts.map((a: any) => {
              const on = open === a.id
              return (
                <button key={a.id} onClick={() => setOpen(on ? null : a.id)}
                  style={{ ...cardStyle, padding: '18px 20px', textAlign: 'left', cursor: 'pointer',
                    border: on ? `1px solid ${L.ink}` : `1px solid ${L.line}`, fontFamily: 'inherit' }}>
                  <div style={{ ...microLabel, marginBottom: '2px' }}>{a.institution}</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: L.ink }}>{a.name}</div>
                  <div style={{ fontSize: '12px', color: L.inkFaint, ...num }}>····{a.last4}</div>
                  <div style={{ fontFamily: F.serif, fontSize: '30px', lineHeight: 1.15, marginTop: '12px',
                    color: a.net < 0 ? L.ink : L.green, ...num }}>{signed(a.net)}</div>
                  <div style={{ display: 'flex', gap: '14px', marginTop: '9px', fontSize: '12px', color: L.inkBody, ...num }}>
                    <span>in {money(a.in)}</span><span>out {money(a.out)}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: L.inkFaint, marginTop: '4px' }}>
                    {a.count} payment{a.count === 1 ? '' : 's'}{on ? ' · showing below' : ''}
                  </div>
                </button>
              )
            })}
          </div>

          {/* ── the two buckets that are NOT accounts, and are not each other ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px', marginBottom: '30px' }}>
            <div style={{ ...cardStyle, padding: '18px 20px', background: L.amberWash, border: `1px solid ${L.amberLine}` }}>
              <div style={{ ...microLabel, color: L.amber, marginBottom: '4px' }}>⚠ Unrecorded account</div>
              <div style={{ fontSize: '13px', color: L.inkBody, lineHeight: 1.5, marginBottom: '10px' }}>
                {d.unknown.count} payment{d.unknown.count === 1 ? '' : 's'} · {money(d.unknown.in || d.unknown.out)} —
                this money landed somewhere and the destination was never written down.
              </div>
              {d.unknown.rows.map((p: any) => (
                <div key={p.id} style={{ padding: '6px 0', borderTop: `1px solid ${L.amberLine}`, fontSize: '13px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span style={{ ...num, color: L.inkBody }}>{(p.paid_at || '').slice(0, 10)}</span>
                    <span style={{ ...num, fontWeight: 600 }}>{money(p.amount)}</span>
                    <span style={{ color: L.inkFaint }}>{p.method}{p.slot ? ` · ${p.slot}` : ''}</span>
                    <button onClick={() => { setAssigning(assigning === p.id ? null : p.id); setPick(''); setRef(''); setErr(null) }}
                      style={{ marginLeft: 'auto', padding: '4px 11px', fontSize: '12px', borderRadius: '99px',
                        border: `1px solid ${L.amberLine}`, background: assigning === p.id ? L.ink : L.card,
                        color: assigning === p.id ? '#fff' : L.ink, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {assigning === p.id ? 'Cancel' : 'Assign'}
                    </button>
                  </div>

                  {assigning === p.id && (
                    <div style={{ padding: '10px 0 4px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
                      <div style={{ ...microLabel }}>Which account received this?</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {accounts.map((a: any) => (
                          <button key={a.id} onClick={() => setPick(a.id)} style={pill(pick === a.id)}>
                            {a.name} ····{a.last4}
                          </button>
                        ))}
                      </div>
                      <input value={ref} onChange={e => setRef(e.target.value)}
                        placeholder="Reference (optional) — for matching a bank statement later"
                        style={{ padding: '8px 11px', fontSize: '13px', border: `1px solid ${L.line}`,
                          borderRadius: '7px', background: L.card, color: L.ink, fontFamily: 'inherit' }} />
                      {err && <div style={{ fontSize: '12px', color: L.red }}>{err}</div>}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button disabled={!pick || busy} onClick={() => assign(p.id)}
                          style={{ padding: '7px 14px', fontSize: '13px', borderRadius: '99px', fontFamily: 'inherit',
                            border: 'none', background: pick && !busy ? L.ink : L.line,
                            color: pick && !busy ? '#fff' : L.inkFaint, cursor: pick && !busy ? 'pointer' : 'not-allowed' }}>
                          {busy ? 'Saving…' : 'Save account'}
                        </button>
                        <span style={{ fontSize: '12px', color: L.inkFaint }}>
                          Sets the account only — the amount and date are not editable here.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ ...cardStyle, padding: '18px 20px' }}>
              <div style={{ ...microLabel, marginBottom: '4px' }}>Cash</div>
              <div style={{ fontFamily: F.serif, fontSize: '26px', lineHeight: 1.2, ...num }}>{signed(d.cash.net)}</div>
              <div style={{ fontSize: '13px', color: L.inkBody, lineHeight: 1.5, marginTop: '8px' }}>
                {d.cash.count} payment{d.cash.count === 1 ? '' : 's'}. No bank account by nature —
                nothing is missing here. Kept apart from unrecorded for that reason.
              </div>
            </div>
          </div>

          {/* ── the month grid ── */}
          <div style={{ ...microLabel, marginBottom: '8px' }}>By month · net movement</div>
          <div style={{ ...cardStyle, overflowX: 'auto', marginBottom: '30px' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: L.cardAlt }}>
                  <th style={th}>Month</th>
                  {accounts.map((a: any) => <th key={a.id} style={{ ...th, textAlign: 'right' }}>{a.name}</th>)}
                  <th style={{ ...th, textAlign: 'right', color: L.amber }}>Unrecorded</th>
                  <th style={{ ...th, textAlign: 'right' }}>Cash</th>
                  <th style={{ ...th, textAlign: 'right' }}>Net</th>
                </tr>
              </thead>
              <tbody>
                {d.grid.map((g: any) => (
                  <tr key={g.month} style={{ borderTop: `1px solid ${L.lineFaint}` }}>
                    <td style={{ ...td, fontWeight: 600 }}>{monthName(g.month)}</td>
                    {accounts.map((a: any) => <td key={a.id} style={tdNum}>{g.cells[a.id] ? signed(g.cells[a.id]) : '—'}</td>)}
                    <td style={{ ...tdNum, color: g.cells.unknown ? L.amber : L.inkFaint }}>{g.cells.unknown ? signed(g.cells.unknown) : '—'}</td>
                    <td style={tdNum}>{g.cells.cash ? signed(g.cells.cash) : '—'}</td>
                    <td style={{ ...tdNum, fontWeight: 600 }}>{signed(g.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── drill-down ── */}
          {openAcct && (
            <>
              <div style={{ ...microLabel, marginBottom: '8px' }}>
                {openAcct.name} ····{openAcct.last4} · {year === 'all' ? 'all time' : year} · {drill.length} payments
              </div>
              <div style={{ ...cardStyle, overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
                  <thead><tr style={{ background: L.cardAlt }}>
                    <th style={th}>Date</th><th style={th}>Dir</th>
                    <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                    <th style={th}>Method</th><th style={th}>Reference</th><th style={th}>Note</th>
                  </tr></thead>
                  <tbody>
                    {drill.map((p: any) => (
                      <tr key={p.id} style={{ borderTop: `1px solid ${L.lineFaint}` }}>
                        <td style={{ ...td, ...num }}>{(p.paid_at || '').slice(0, 10) || '—'}</td>
                        <td style={td}>
                          <span style={{ padding: '2px 8px', borderRadius: '99px', fontSize: '11px',
                            background: p.direction === 'in' ? 'oklch(0.95 0.04 155)' : L.cardAlt,
                            color: p.direction === 'in' ? L.green : L.inkBody }}>{p.direction}</span>
                        </td>
                        <td style={tdNum}>{money(p.amount)}</td>
                        <td style={td}>{p.method || '—'}</td>
                        <td style={{ ...td, ...num, fontSize: '12px', color: L.inkFaint }}>{p.reference || '—'}</td>
                        <td style={{ ...td, color: L.inkBody }}>{p.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

const th: React.CSSProperties = { ...microLabel, padding: '10px 14px', textAlign: 'left', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px 14px', color: L.ink, whiteSpace: 'nowrap' }
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: F.mono, fontVariantNumeric: 'tabular-nums' }
