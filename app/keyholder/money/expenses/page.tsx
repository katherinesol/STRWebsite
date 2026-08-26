'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { EXPENSE_CATEGORIES, HALF_DEDUCTIBLE } from '@/lib/expense-categories'
import { PROPERTY_OPTIONS } from '@/lib/property-options'
import ReceiptQueue from '@/components/admin/ReceiptQueue'
import ReceiptReviewQueue from '@/components/admin/ReceiptReviewQueue'
import { L, F, microLabel, cardStyle, money } from '@/lib/design-tokens'

/* The redesigned expense ledger — replacing the dark one buried at
 *  /admin/property-management/finance, which is where every expense has been
 *  filed until now and which spent this evening returning a 500.
 *
 *  The category breakdown is promoted out of a view toggle and given its own
 *  column. On the legacy screen it hid behind a tab, which is backwards: the
 *  question this page answers is "where is the money going", and the list of
 *  individual rows is the supporting detail, not the headline.
 *
 *  Add, edit and delete all go through /api/admin/expenses, which builds the
 *  row from named fields and puts every category through normaliseCategory —
 *  so a typo cannot reach the column the CRA return is grouped by. */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const pill = (on: boolean): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer',
  background: on ? L.ink : L.card, color: on ? '#fff' : L.ink,
  border: on ? '1px solid transparent' : `1px solid ${L.line}`,
  fontWeight: on ? 600 : 400, fontFamily: F.sans,
})
const field: React.CSSProperties = {
  padding: '9px 12px', borderRadius: '10px', border: `1px solid ${L.line}`,
  background: L.card, fontSize: '14px', fontFamily: F.sans, color: L.ink, width: '100%',
}
const num = (v: any) => (v == null ? 0 : Number(v) || 0)

export default function ExpensesPage() {
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [year, setYear] = useState('2026')
  const [month, setMonth] = useState('')
  const [property, setProperty] = useState('')
  const [category, setCategory] = useState('')
  const [panel, setPanel] = useState<'' | 'new' | 'receipts'>('')
  const [form, setForm] = useState<any>(null)     // null = closed; {id} = editing
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [hstTouched, setHstTouched] = useState(false)

  /*  The form panel renders after the table, and the table is every expense in
      the filtered year — fifty-eight rows, about 2,500px. So "New expense" set
      the state correctly and the form opened two and a half screens below the
      button that opened it, which reads exactly like a dead button. Bring it
      into view instead of moving it: the panel belongs below the list it adds
      to, and a reader who scrolls back up should still find the table where it
      was. */
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!panel) return
    const id = requestAnimationFrame(() =>
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    return () => cancelAnimationFrame(id)
  }, [panel])

  const reload = () => fetch('/api/admin/expenses').then(r => r.json()).then(setD).catch(() => {})

  const blank = () => ({ id: null, date: new Date().toISOString().slice(0, 10), vendor: '', description: '',
    amount: '', hst_paid: '', category: EXPENSE_CATEGORIES[0], property_id: '', notes: '' })

  /* HST follows the amount until it is typed over — the same rule the legacy
     screen used, kept because 13/113 of a receipt total is right often enough
     to be worth pre-filling and wrong often enough to stay editable. */
  function setField(k: string, v: any) {
    setForm((f: any) => {
      if (k === 'hst_paid') { setHstTouched(true); return { ...f, hst_paid: v } }
      if (k === 'amount' && !hstTouched) {
        const a = parseFloat(String(v))
        return { ...f, amount: v, hst_paid: a ? (a * 13 / 113).toFixed(2) : '' }
      }
      return { ...f, [k]: v }
    })
  }

  async function save() {
    if (!form?.date || !form?.description || !form?.amount) { setNote('Date, description and amount are required.'); return }
    setBusy(true); setNote('')
    const body = { date: form.date, vendor: form.vendor || null, description: form.description,
      amount: Number(form.amount), hst_paid: Number(form.hst_paid) || 0, category: form.category,
      property_id: form.property_id || null, notes: form.notes || null }
    const r = form.id
      ? await fetch(`/api/admin/expenses/${form.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/admin/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, force: true }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setNote(j.error || `Could not save (${r.status})`); return }
    setForm(null); setPanel(''); setHstTouched(false); reload()
  }

  async function remove(e: any) {
    if (!confirm(`Delete “${e.description}” for ${money(e.amount)}? This cannot be undone.`)) return
    const r = await fetch(`/api/admin/expenses/${e.id}`, { method: 'DELETE' })
    if (!r.ok) { const j = await r.json().catch(() => ({})); setNote(j.error || `Could not delete (${r.status})`); return }
    reload()
  }

  useEffect(() => {
    fetch('/api/admin/expenses')
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`); return r.json() })
      .then(setD).catch(e => setErr(e.message)).finally(() => setLoading(false))
  }, [])

  const all = d?.expenses || []
  const filtered = useMemo(() => all.filter((e: any) => {
    const dt = String(e.date || '')
    if (year && !dt.startsWith(year)) return false
    if (month && dt.slice(5, 7) !== month) return false
    if (property && e.property_id !== property) return false
    if (category && e.category !== category) return false
    return true
  }), [all, year, month, property, category])

  const t = useMemo(() => {
    const total = filtered.reduce((s: number, e: any) => s + num(e.amount), 0)
    const hst = filtered.reduce((s: number, e: any) => s + num(e.hst_paid), 0)
    const byCat = EXPENSE_CATEGORIES
      .map(c => ({
        cat: c,
        total: filtered.filter((e: any) => e.category === c).reduce((s: number, e: any) => s + num(e.amount), 0),
        count: filtered.filter((e: any) => e.category === c).length,
      }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.total - a.total)
    return { total, hst, byCat, biggest: byCat[0] || null, count: filtered.length }
  }, [filtered])

  const years = useMemo(() => {
    const ys = [...new Set(all.map((e: any) => String(e.date || '').slice(0, 4)).filter(Boolean))] as string[]
    return ys.sort().reverse()
  }, [all])

  const col = '86px 1.7fr 1.1fr 96px 96px 40px'

  return (
    <div style={{ paddingTop: '24px' }}>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '24px', marginBottom: '22px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <span style={{ fontFamily: F.serif, fontSize: '40px', lineHeight: 1 }}>Expenses</span>
          <span style={{ fontSize: '15px', color: L.inkBody }}>
            {loading ? 'Reading the ledger…'
              : err ? `Could not load expenses — ${err}`
              : t.count === 0 ? 'Nothing filed for this period.'
              : `${money(t.total)} across ${t.count} expense${t.count === 1 ? '' : 's'} · ${money(t.hst)} HST recoverable`}
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
          {!!d?.pendingCount && (
            <span style={{ fontSize: '13px', color: L.amber, background: L.amberWash, border: `1px solid ${L.amberLine}`, borderRadius: '99px', padding: '7px 14px' }}>
              {d.pendingCount} receipt{d.pendingCount === 1 ? '' : 's'} awaiting review
            </span>
          )}
          <button onClick={() => setPanel(panel === 'receipts' ? '' : 'receipts')}
            style={{ padding: '12px 18px', borderRadius: '10px', border: `1px solid ${L.line}`, background: L.card, fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: F.sans, color: L.ink }}>
            Add receipts
          </button>
          <button onClick={() => { if (panel === 'new') { setPanel(''); setForm(null) } else { setPanel('new'); setForm(blank()); setHstTouched(false) } }}
            style={{ padding: '12px 20px', borderRadius: '10px', background: L.ink, color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: F.sans }}>
            New expense
          </button>
        </div>
      </div>

      {!loading && !err && (
        <>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
            {years.map(y => <button key={y} onClick={() => setYear(y)} style={pill(year === y)}>{y}</button>)}
            <span style={{ width: '1px', height: '22px', background: L.line }} />
            <button onClick={() => setProperty('')} style={pill(property === '')}>All properties</button>
            {PROPERTY_OPTIONS.filter((p: any) => p.id).map((p: any) =>
              <button key={p.id} onClick={() => setProperty(p.id)} style={pill(property === p.id)}>{p.name}</button>)}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <select value={month} onChange={e => setMonth(e.target.value)} style={{ ...field, width: 'auto' }}>
                <option value="">All months</option>
                {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
              </select>
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...field, width: 'auto', maxWidth: '260px' }}>
                <option value="">All categories</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </span>
          </div>

          {/* Receipts that arrived by email and need a decision. pending_receipts
              is written by the inbound-email route, so this queue is the only
              way one ever gets approved — it must never be the thing left behind
              when a page is retired. Renders nothing when the queue is empty. */}
          {!!(d?.pending || []).length && (
            <div style={{ marginBottom: '22px' }}>
              <ReceiptReviewQueue initialPending={d.pending} onResolved={reload} />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '14px', marginBottom: '22px' }}>
            <div style={{ background: L.inkCard, borderRadius: '16px', padding: '22px', color: L.onInk, display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={{ ...microLabel, color: 'oklch(0.75 0.02 80)' }}>Claimed</span>
              <span style={{ fontFamily: F.serif, fontSize: '36px', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{money(t.total)}</span>
              <span style={{ fontSize: '12px', color: L.onInkFaint }}>
                {t.count} expense{t.count === 1 ? '' : 's'} · {month ? MONTHS[Number(month) - 1] + ' ' : ''}{year}
              </span>
            </div>
            <div style={{ ...cardStyle, padding: '22px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={microLabel}>HST paid · input credit</span>
              <span style={{ fontFamily: F.serif, fontSize: '30px', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{money(t.hst)}</span>
              <span style={{ fontSize: '12px', color: L.inkMuted }}>recoverable against HST collected</span>
            </div>
            <div style={{ ...cardStyle, padding: '22px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={microLabel}>Largest category</span>
              <span style={{ fontFamily: F.serif, fontSize: '30px', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{money(t.biggest?.total)}</span>
              <span style={{ fontSize: '12px', color: L.inkMuted }}>{t.biggest ? t.biggest.cat : '—'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

            <div style={{ flex: '1 1 620px', minWidth: 0, ...cardStyle, overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', background: L.cardAlt, borderBottom: `1px solid ${L.lineSoft}` }}>
                <span style={{ ...microLabel, letterSpacing: '0.12em' }}>
                  {category || 'Every expense'} · newest first
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: '660px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: col, padding: '10px 20px', borderBottom: `1px solid ${L.lineFaint}`, ...microLabel, letterSpacing: '0.1em' }}>
                    <span>Date</span><span>Description</span><span>Category</span>
                    <span style={{ textAlign: 'right' }}>Amount</span>
                    <span style={{ textAlign: 'right' }}>HST</span><span />
                  </div>
                  {!filtered.length ? (
                    <div style={{ padding: '28px 20px', fontSize: '14px', color: L.inkMuted }}>Nothing filed for this period.</div>
                  ) : filtered.map((e: any) => (
                    <div key={e.id} onClick={() => { setForm({ ...blank(), ...e, amount: String(e.amount ?? ''), hst_paid: String(e.hst_paid ?? ''), property_id: e.property_id || '' }); setHstTouched(true); setPanel('new') }}
                      style={{ display: 'grid', gridTemplateColumns: col, padding: '13px 20px', borderBottom: `1px solid ${L.lineFaint}`, alignItems: 'center', cursor: 'pointer', background: form?.id === e.id ? L.cardAlt : 'transparent' }}>
                      <span style={{ fontSize: '13px', color: L.inkBody, fontVariantNumeric: 'tabular-nums' }}>{String(e.date || '').slice(5)}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontSize: '14px', color: L.ink, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description}</span>
                        <span style={{ fontSize: '11px', color: L.inkMuted }}>
                          {e.vendor || 'no vendor'}
                          {e.ai_extracted ? ' · read from receipt' : ''}
                          {e.signed_receipt_url ? ' · ' : ''}
                          {e.signed_receipt_url && <a href={e.signed_receipt_url} target="_blank" rel="noopener noreferrer" style={{ color: L.link }}>receipt</a>}
                        </span>
                      </span>
                      <span style={{ fontSize: '12px', color: L.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.category}{HALF_DEDUCTIBLE.includes(e.category) ? ' · 50%' : ''}
                      </span>
                      <span style={{ textAlign: 'right', fontSize: '14px', fontVariantNumeric: 'tabular-nums', color: L.ink }}>{money(e.amount)}</span>
                      <span style={{ textAlign: 'right', fontSize: '13px', fontVariantNumeric: 'tabular-nums', color: L.inkMuted }}>{e.hst_paid ? money(e.hst_paid) : '—'}</span>
                      <span style={{ textAlign: 'right' }}>
                        <button onClick={ev => { ev.stopPropagation(); remove(e) }} title="Delete this expense"
                          style={{ background: 'none', border: 'none', color: L.inkFaint, cursor: 'pointer', fontSize: '15px' }}>×</button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ flex: '0 1 320px', minWidth: '260px', ...cardStyle, overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', background: L.cardAlt, borderBottom: `1px solid ${L.lineSoft}` }}>
                <span style={{ ...microLabel, letterSpacing: '0.12em' }}>Where it went</span>
              </div>
              {!t.byCat.length ? (
                <div style={{ padding: '22px 20px', fontSize: '13px', color: L.inkMuted }}>Nothing to break down.</div>
              ) : t.byCat.map(c => {
                const pct = t.total > 0 ? (c.total / t.total) * 100 : 0
                const on = category === c.cat
                return (
                  <button key={c.cat} onClick={() => setCategory(on ? '' : c.cat)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 20px', border: 'none', borderBottom: `1px solid ${L.lineFaint}`, background: on ? L.cardAlt : 'transparent', cursor: 'pointer', fontFamily: F.sans }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '13px', color: L.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.cat}</span>
                      <span style={{ fontSize: '13px', color: L.ink, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money(c.total)}</span>
                    </span>
                    <span style={{ display: 'block', height: '3px', borderRadius: '99px', background: L.lineSoft, marginTop: '7px' }}>
                      <span style={{ display: 'block', height: '3px', borderRadius: '99px', width: `${pct}%`, background: on ? L.ink : L.gold }} />
                    </span>
                    <span style={{ fontSize: '11px', color: L.inkFaint, marginTop: '4px', display: 'block' }}>
                      {c.count} expense{c.count === 1 ? '' : 's'} · {pct.toFixed(0)}%
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {panel === 'new' && form && (
            <div ref={panelRef} style={{ ...cardStyle, padding: '22px', marginTop: '20px', scrollMarginTop: '18px' }}>
              <span style={{ ...microLabel, display: 'block', marginBottom: '14px' }}>{form.id ? 'Edit expense' : 'New expense'}</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><span style={microLabel}>Date</span>
                  <input type="date" value={form.date || ''} onChange={e => setField('date', e.target.value)} style={field} /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><span style={microLabel}>Vendor</span>
                  <input value={form.vendor || ''} onChange={e => setField('vendor', e.target.value)} list="vendors" style={field} placeholder="Home Depot" />
                  <datalist id="vendors">{(d?.vendors || []).map((v: string) => <option key={v} value={v} />)}</datalist></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', gridColumn: 'span 2' }}><span style={microLabel}>Description</span>
                  <input value={form.description || ''} onChange={e => setField('description', e.target.value)} style={field} placeholder="Replacement kettle" /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><span style={microLabel}>Amount</span>
                  <input value={form.amount || ''} onChange={e => setField('amount', e.target.value)} style={field} placeholder="0.00" inputMode="decimal" /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><span style={microLabel}>HST paid</span>
                  <input value={form.hst_paid || ''} onChange={e => setField('hst_paid', e.target.value)} style={field} placeholder="auto — amount × 13/113" inputMode="decimal" /></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><span style={microLabel}>Category</span>
                  <select value={form.category} onChange={e => setField('category', e.target.value)} style={field}>
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><span style={microLabel}>Property</span>
                  <select value={form.property_id || ''} onChange={e => setField('property_id', e.target.value)} style={field}>
                    {PROPERTY_OPTIONS.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px', alignItems: 'center' }}>
                <button onClick={save} disabled={busy}
                  style={{ padding: '11px 20px', borderRadius: '10px', background: busy ? L.lineSoft : L.ink, color: busy ? L.inkFaint : '#fff', border: 'none', fontSize: '14px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: F.sans }}>
                  {busy ? 'Saving…' : form.id ? 'Save changes' : 'Save expense'}</button>
                <button onClick={() => { setPanel(''); setForm(null); setNote('') }}
                  style={{ padding: '11px 18px', borderRadius: '10px', border: `1px solid ${L.line}`, background: L.card, fontSize: '14px', cursor: 'pointer', fontFamily: F.sans, color: L.ink }}>Cancel</button>
                {note && <span style={{ fontSize: '13px', color: L.red }}>{note}</span>}
              </div>
            </div>
          )}

          {panel === 'receipts' && (
            <div ref={panelRef} style={{ ...cardStyle, padding: '22px', marginTop: '20px' }}>
              <span style={{ ...microLabel, display: 'block', marginBottom: '10px' }}>Add receipts</span>
              <p style={{ fontSize: '13px', color: L.inkBody, maxWidth: '620px', marginTop: 0 }}>
                Drop images or PDFs. Multi-page PDFs are split a page at a time, each page read
                for vendor, amount, HST and category, and checked against what is already filed
                before anything is saved.
              </p>
              <ReceiptQueue categories={EXPENSE_CATEGORIES as unknown as string[]}
                onAllSaved={() => { setPanel(''); reload() }} />
              <button onClick={() => setPanel('')}
                style={{ padding: '11px 18px', borderRadius: '10px', border: `1px solid ${L.line}`, background: L.card, fontSize: '14px', cursor: 'pointer', fontFamily: F.sans, color: L.ink, marginTop: '12px' }}>Close</button>
            </div>
          )}

        </>
      )}
    </div>
  )
}
