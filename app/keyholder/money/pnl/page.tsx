'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { L, F, microLabel, cardStyle, money } from '@/lib/design-tokens'
import { PROPERTY_OPTIONS } from '@/lib/property-options'

/*  Profit and loss, combined. See app/api/admin/pnl/route.ts for why revenue is
 *  what was earned rather than what the guest paid, and why tax appears only as
 *  a note. Every figure here links to the rows behind it — a number you cannot
 *  open is a number you have to trust. */

const KIND_LABEL: Record<string, string> = {
  damage_recovery: 'Damage recovery',
  insurance: 'Insurance',
  refund_received: 'Refund received',
  other: 'Other',
}
const num: React.CSSProperties = { fontFamily: F.mono, fontVariantNumeric: 'tabular-nums' }
const pill = (on: boolean): React.CSSProperties => ({
  padding: '8px 13px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
  background: on ? L.ink : L.card, color: on ? '#fff' : L.ink,
  border: on ? '1px solid transparent' : `1px solid ${L.line}`, fontWeight: on ? 600 : 400,
})
const field: React.CSSProperties = {
  padding: '8px 11px', fontSize: '13px', border: `1px solid ${L.line}`,
  borderRadius: '7px', background: L.card, color: L.ink, fontFamily: 'inherit',
}

export default function PnlPage() {
  const [year, setYear] = useState('2026')
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<any[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = () => fetch(`/api/admin/pnl?year=${year}`).then(r => r.json()).then(setD).catch(() => {})
  useEffect(() => { setLoading(true); load().finally?.(() => {}); fetch(`/api/admin/pnl?year=${year}`)
    .then(r => r.json()).then(setD).catch(() => {}).finally(() => setLoading(false)) }, [year])
  useEffect(() => { fetch('/api/admin/accounts?year=all').then(r => r.json())
    .then(j => setAccounts(j.accounts || [])).catch(() => {}) }, [])

  const blank = () => ({ amount: '', paid_at: new Date().toISOString().slice(0, 10),
    kind: 'damage_recovery', property_id: '', account_id: '', reference: '', note: '' })

  async function save() {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/other-income', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount),
          property_id: form.property_id || null, account_id: form.account_id || null,
          reference: form.reference || null, note: form.note || null }),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.detail || j.error || 'Could not save'); return }
      setAdding(false); setForm(null)
      setLoading(true)
      fetch(`/api/admin/pnl?year=${year}`).then(r => r.json()).then(setD).finally(() => setLoading(false))
    } catch (e: any) { setErr(e?.message || 'Could not save') }
    finally { setBusy(false) }
  }

  const R = d?.revenue, X = d?.expenses

  return (
    <div style={{ paddingTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap', marginBottom: '6px' }}>
        <span style={{ fontFamily: F.serif, fontSize: '36px', lineHeight: 1 }}>Profit &amp; loss</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['2026', 'all'].concat((d?.years || []).filter((y: string) => y !== '2026'))
            .filter((v, i, a) => a.indexOf(v) === i).map((y: string) => (
              <button key={y} onClick={() => setYear(y)} style={pill(year === y)}>{y === 'all' ? 'All time' : y}</button>
            ))}
        </div>
      </div>
      <p style={{ fontSize: '13px', color: L.inkBody, marginBottom: '22px', maxWidth: '680px', lineHeight: 1.55 }}>
        One business, one number — nothing is apportioned between properties. Revenue is what
        was <strong>earned</strong>, so platform commission and processing appear as costs rather than
        being netted off invisibly. Tax is neither income nor expense and is reported below.
      </p>

      {loading && <div style={{ fontSize: '13px', color: L.inkFaint }}>Loading…</div>}

      {!loading && d && (
        <>
          {d.incomplete?.length > 0 && (
            <div style={{ ...cardStyle, padding: '14px 18px', marginBottom: '18px', background: L.amberWash, border: `1px solid ${L.amberLine}` }}>
              <div style={{ ...microLabel, color: L.amber, marginBottom: '3px' }}>This total is not complete</div>
              <div style={{ fontSize: '13px', color: L.inkBody, lineHeight: 1.5 }}>
                {d.incomplete.length} booking{d.incomplete.length === 1 ? '' : 's'} carr{d.incomplete.length === 1 ? 'ies' : 'y'} no
                figures, so {d.incomplete.length === 1 ? 'it contributes' : 'they contribute'} nothing to revenue:{' '}
                {d.incomplete.map((b: any, i: number) => (
                  <span key={b.id}>{i > 0 ? ', ' : ''}
                    <Link href={`/keyholder/stays/booking/${b.id}`} style={{ color: L.link, fontWeight: 600 }}>
                      {b.guest || b.ref}
                    </Link>
                  </span>
                ))}. A free stay is fine; an unfinished one is not.
              </div>
            </div>
          )}

          {/* ── the number ── */}
          <div style={{ ...cardStyle, padding: '24px 26px', marginBottom: '20px', background: L.inkCard, color: L.onInk }}>
            <div style={{ ...microLabel, color: L.onInkFaint, marginBottom: '4px' }}>Net {year === 'all' ? 'all time' : year}</div>
            <div style={{ fontFamily: F.serif, fontSize: '46px', lineHeight: 1.05, ...num }}>
              {d.net < 0 ? '−' : ''}{money(Math.abs(d.net))}
            </div>
            <div style={{ fontSize: '13px', color: L.onInkFaint, marginTop: '8px', ...num }}>
              {money(R.total)} revenue − {money(X.total)} expenses
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
            {/* ── revenue ── */}
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', background: L.cardAlt, borderBottom: `1px solid ${L.lineSoft}` }}>
                <span style={microLabel}>Revenue — what was earned</span>
              </div>
              <Row label="Platform bookings" meta={`${R.platform_count} stays`} amount={R.platform} href="/keyholder/money/income" />
              <Row label="Direct bookings" meta={`${R.direct_count} stays`} amount={R.direct} href="/keyholder/money/income" />
              <Row label="Non-booking income" meta={`${R.other_count} entr${R.other_count === 1 ? 'y' : 'ies'}`} amount={R.other} />
              <Row label="Total revenue" amount={R.total} bold />
            </div>

            {/* ── expenses ── */}
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', background: L.cardAlt, borderBottom: `1px solid ${L.lineSoft}` }}>
                <span style={microLabel}>Expenses</span>
              </div>
              {X.byCategory.map((c: any) => (
                <Row key={c.category} label={c.category} amount={c.amount}
                  href={`/keyholder/money/expenses?category=${encodeURIComponent(c.category)}`} />
              ))}
              <Row label="Platform commission" meta="deducted at source" amount={X.commission} />
              <Row label="Payment processing" meta="deducted at source" amount={X.processing} />
              <Row label="Total expenses" amount={X.total} bold />
            </div>
          </div>

          {/* ── tax, reported not counted ── */}
          <div style={{ ...cardStyle, marginTop: '18px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', background: L.cardAlt, borderBottom: `1px solid ${L.lineSoft}` }}>
              <span style={microLabel}>Tax — reported, never counted above</span>
            </div>
            <Row label="Collected from guests" amount={d.tax.collected} />
            <Row label="Passed to you to remit" meta="a liability, not income" amount={d.tax.passed_to_you} />
            <Row label="Remitted by the platforms" amount={d.tax.platform_remits} />
            <Row label="HST paid on expenses" meta="input tax credits" amount={d.tax.hst_paid_on_expenses} href="/keyholder/money/tax" />
          </div>

          {/* ── non-booking income, with its entry point ── */}
          <div style={{ ...cardStyle, marginTop: '18px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', background: L.cardAlt, borderBottom: `1px solid ${L.lineSoft}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <span style={microLabel}>Non-booking income</span>
              <button onClick={() => { setAdding(!adding); setForm(adding ? null : blank()); setErr('') }}
                style={{ ...pill(adding), padding: '6px 12px', fontSize: '12px' }}>
                {adding ? 'Cancel' : 'Add income'}
              </button>
            </div>

            {d.other_income.length === 0 && !adding && (
              <div style={{ padding: '16px 18px', fontSize: '13px', color: L.inkBody, lineHeight: 1.5 }}>
                Nothing recorded. Damage recoveries, insurance settlements and refunds received belong
                here — money the business earned that never came through a booking. Without them a
                P&amp;L understates revenue and looks complete doing it.
              </div>
            )}

            {d.other_income.map((o: any) => (
              <div key={o.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '11px 18px', borderTop: `1px solid ${L.lineFaint}`, fontSize: '13px' }}>
                <span style={{ ...num, color: L.inkBody, width: '92px' }}>{String(o.paid_at || '').slice(0, 10)}</span>
                <span style={{ width: '140px', color: L.ink }}>{KIND_LABEL[o.kind] || o.kind}</span>
                <span style={{ flex: 1, color: L.inkBody, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.note || o.reference || '—'}
                </span>
                <span style={{ ...num, fontWeight: 600 }}>{money(o.amount)}</span>
              </div>
            ))}

            {adding && form && (
              <div style={{ padding: '16px 18px', borderTop: `1px solid ${L.lineFaint}`, display: 'flex', flexDirection: 'column', gap: '11px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><span style={microLabel}>Date</span>
                    <input type="date" value={form.paid_at} onChange={e => setForm({ ...form, paid_at: e.target.value })} style={field} /></label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><span style={microLabel}>Amount</span>
                    <input value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} inputMode="decimal" placeholder="0.00" style={field} /></label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><span style={microLabel}>What kind</span>
                    <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })} style={field}>
                      {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select></label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><span style={microLabel}>Property</span>
                    <select value={form.property_id} onChange={e => setForm({ ...form, property_id: e.target.value })} style={field}>
                      {PROPERTY_OPTIONS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select></label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><span style={microLabel}>Which account</span>
                    <select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })} style={field}>
                      <option value="">Not recorded</option>
                      {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name} ····{a.last4}</option>)}
                    </select></label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><span style={microLabel}>Reference</span>
                    <input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Claim or payout id" style={field} /></label>
                </div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><span style={microLabel}>Note</span>
                  <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="What this was for" style={field} /></label>
                {err && <div style={{ fontSize: '12px', color: L.red }}>{err}</div>}
                <div style={{ display: 'flex', gap: '9px', alignItems: 'center' }}>
                  <button onClick={save} disabled={busy || !form.amount || !form.paid_at}
                    style={{ padding: '8px 16px', borderRadius: '99px', fontSize: '13px', fontWeight: 600, border: 'none', fontFamily: 'inherit',
                      background: (!form.amount || busy) ? L.line : L.ink, color: (!form.amount || busy) ? L.inkFaint : '#fff',
                      cursor: (!form.amount || busy) ? 'not-allowed' : 'pointer' }}>
                    {busy ? 'Saving…' : 'Save income'}
                  </button>
                  <span style={{ fontSize: '12px', color: L.inkFaint }}>
                    Money going out is an expense — this records income only.
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Row({ label, meta, amount, href, bold }: {
  label: string; meta?: string; amount: number; href?: string; bold?: boolean
}) {
  const body = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', padding: '11px 18px',
      borderTop: `1px solid ${L.lineFaint}`, background: bold ? L.cardAlt : 'transparent' }}>
      <span style={{ fontSize: '13px', color: L.ink, fontWeight: bold ? 600 : 400 }}>{label}</span>
      {meta && <span style={{ fontSize: '12px', color: L.inkFaint }}>{meta}</span>}
      <span style={{ marginLeft: 'auto', fontFamily: F.mono, fontVariantNumeric: 'tabular-nums',
        fontSize: bold ? '15px' : '14px', fontWeight: bold ? 600 : 400, color: L.ink }}>
        {money(amount)}
      </span>
    </div>
  )
  return href ? <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>{body}</Link> : body
}
