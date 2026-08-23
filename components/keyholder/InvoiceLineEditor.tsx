'use client'
import { useState } from 'react'
import { L, F, microLabel, cardStyle, money } from '@/lib/design-tokens'
import { EXPENSE_CATEGORIES } from '@/lib/expense-categories'

// Editing an invoice's line items and adjustments.
//
// Nothing is written from this component directly. "Review changes" asks the API
// for a read-only preview, and only the confirm step commits — through one SQL
// transaction, so a failed edit leaves the invoice exactly as it was.
//
// Ids are generated here so the payload always carries a stable identity for
// every row. That is what lets the server tell an edit from an insert, and it is
// the same discipline that stops a double-submit writing twice.

type Row = { id: string; description: string; amount: string; reason?: string }

const toRows = (rows: any[], withReason = false): Row[] =>
  (rows || []).map(r => ({
    id: r.id, description: r.description || '', amount: String(r.amount ?? ''),
    ...(withReason ? { reason: r.reason || 'other' } : {}),
  }))

const input: React.CSSProperties = {
  padding: '9px 11px', border: `1px solid ${L.line}`, borderRadius: '9px',
  fontSize: '14px', fontFamily: F.sans, background: '#fff', minWidth: 0,
}

export default function InvoiceLineEditor({ invoice, items, adjustments, onSaved }: {
  invoice: any; items: any[]; adjustments: any[]; onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [it, setIt] = useState<Row[]>([])
  const [adj, setAdj] = useState<Row[]>([])
  const [category, setCategory] = useState(invoice.category || '')
  const [hst, setHst] = useState(String(invoice.hst_amount ?? 0))
  const [preview, setPreview] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<any>(null)

  function start() {
    setIt(toRows(items)); setAdj(toRows(adjustments, true))
    setCategory(invoice.category || ''); setHst(String(invoice.hst_amount ?? 0))
    setErr(''); setPreview(null); setDone(null); setOpen(true)
  }

  const n = (v: string) => Number(v) || 0
  const r2 = (v: number) => Math.round(v * 100) / 100
  const draftTotal = r2(it.reduce((s, r) => s + n(r.amount), 0) - adj.reduce((s, r) => s + n(r.amount), 0) + n(hst))

  const payload = () => ({
    invoice_id: invoice.id, category, hst_amount: n(hst),
    items: it.filter(r => r.description.trim()).map(r => ({ id: r.id, description: r.description, amount: n(r.amount) })),
    adjustments: adj.filter(r => r.description.trim()).map(r => ({ id: r.id, description: r.description, amount: n(r.amount), reason: r.reason || 'other' })),
  })

  async function call(commit: boolean) {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/invoices/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload(), commit }),
      })
      const j = await res.json().catch(() => ({}))
      if (!j.ok) { setErr(j.error || 'Could not save'); if (commit) return; setPreview(j); return }
      if (commit) { setDone(j); setPreview(null); setOpen(false); onSaved() } else setPreview(j)
    } catch { setErr('Could not reach the server — nothing was changed.') }
    finally { setBusy(false) }
  }

  const syncedCount = (done?.expenses_to_sync || []).length
  const doneToast = done ? (
    <div style={{ position: 'fixed', right: '24px', bottom: '24px', zIndex: 70, ...cardStyle, border: `1px solid ${L.amberLine}`, background: L.amberWash, borderRadius: '14px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px', maxWidth: '480px', boxShadow: '0 8px 28px oklch(0.25 0.01 60 / 0.12)' }}>
      <span style={{ fontSize: '13px', lineHeight: 1.5 }}>
        Saved. Total {money(done.before.total)} → <strong>{money(done.after.total)}</strong>.
        {syncedCount > 0 && ` ${syncedCount} linked expense${syncedCount > 1 ? 's' : ''} re-categorised to ${done.after.category}.`}
        {syncedCount === 0 && ' No expense was changed.'}
      </span>
      <button onClick={() => setDone(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: L.inkMuted, cursor: 'pointer', fontSize: '13px', fontFamily: F.sans }}>Dismiss</button>
    </div>
  ) : null

  const rowGrid = (withReason: boolean): React.CSSProperties => ({
    display: 'grid', gridTemplateColumns: withReason ? '1fr 120px 130px 34px' : '1fr 130px 34px',
    gap: '8px', alignItems: 'center', marginBottom: '8px',
  })
  const del = (setter: any, list: Row[], id: string) => setter(list.filter(r => r.id !== id))
  const upd = (setter: any, list: Row[], id: string, k: string, v: string) =>
    setter(list.map(r => (r.id === id ? { ...r, [k]: v } : r)))

  return (
    <>
      <button onClick={start} style={{ padding: '9px 15px', borderRadius: '9px', background: 'transparent', border: `1px solid ${L.line}`, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: F.sans }}>
        Edit line items
      </button>
      {doneToast}
      {open && (
      <div style={{ position: 'fixed', inset: 0, background: 'oklch(0.25 0.01 60 / 0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 24px', zIndex: 50, overflowY: 'auto' }}>
      <div style={{ ...cardStyle, borderRadius: '18px', padding: '26px', width: '660px', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <span style={{ fontSize: '15px', fontWeight: 600 }}>Editing</span>
        <span style={{ fontSize: '13px', color: L.inkMuted }}>nothing is saved until you confirm</span>
      </div>

      <div>
        <div style={microLabel}>Line items</div>
        <div style={{ marginTop: '9px' }}>
          {it.map(r => (
            <div key={r.id} style={rowGrid(false)}>
              <input value={r.description} placeholder="what the work was" style={input}
                onChange={e => upd(setIt, it, r.id, 'description', e.target.value)} />
              <input type="number" value={r.amount} min="0" step="0.01" style={{ ...input, fontFamily: F.mono, textAlign: 'right' }}
                onChange={e => upd(setIt, it, r.id, 'amount', e.target.value)} />
              <button onClick={() => del(setIt, it, r.id)} title="Remove"
                style={{ padding: '8px', borderRadius: '8px', border: `1px solid ${L.line}`, background: 'transparent', cursor: 'pointer', color: L.inkMuted, fontFamily: F.sans }}>×</button>
            </div>
          ))}
        </div>
        <button onClick={() => setIt([...it, { id: crypto.randomUUID(), description: '', amount: '' }])}
          style={{ padding: '7px 13px', borderRadius: '8px', border: `1px dashed ${L.line}`, background: 'transparent', fontSize: '13px', cursor: 'pointer', fontFamily: F.sans, color: L.inkBody }}>
          + Add line
        </button>
      </div>

      <div>
        <div style={microLabel}>Held back — comes off the total</div>
        <div style={{ marginTop: '9px' }}>
          {adj.map(r => (
            <div key={r.id} style={rowGrid(true)}>
              <input value={r.description} placeholder="why it was held back" style={input}
                onChange={e => upd(setAdj, adj, r.id, 'description', e.target.value)} />
              <select value={r.reason} style={{ ...input, padding: '9px' }}
                onChange={e => upd(setAdj, adj, r.id, 'reason', e.target.value)}>
                {['incomplete', 'damage', 'discount', 'other'].map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <input type="number" value={r.amount} min="0" step="0.01" style={{ ...input, fontFamily: F.mono, textAlign: 'right' }}
                onChange={e => upd(setAdj, adj, r.id, 'amount', e.target.value)} />
              <button onClick={() => del(setAdj, adj, r.id)} title="Remove"
                style={{ padding: '8px', borderRadius: '8px', border: `1px solid ${L.line}`, background: 'transparent', cursor: 'pointer', color: L.inkMuted, fontFamily: F.sans }}>×</button>
            </div>
          ))}
        </div>
        <button onClick={() => setAdj([...adj, { id: crypto.randomUUID(), description: '', amount: '', reason: 'incomplete' }])}
          style={{ padding: '7px 13px', borderRadius: '8px', border: `1px dashed ${L.line}`, background: 'transparent', fontSize: '13px', cursor: 'pointer', fontFamily: F.sans, color: L.inkBody }}>
          + Hold back an amount
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: '10px' }}>
        <div>
          <div style={microLabel}>Category</div>
          <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...input, width: '100%', marginTop: '5px' }}>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <div style={microLabel}>HST</div>
          <input type="number" value={hst} min="0" step="0.01" onChange={e => setHst(e.target.value)}
            style={{ ...input, width: '100%', marginTop: '5px', fontFamily: F.mono, textAlign: 'right' }} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', paddingTop: '14px', borderTop: `1px solid ${L.lineSoft}` }}>
        <span style={{ fontSize: '14px', color: L.inkMuted }}>Draft total</span>
        <span style={{ marginLeft: 'auto', fontFamily: F.mono, fontSize: '18px' }}>{money(draftTotal)}</span>
      </div>

      {err && <span style={{ fontSize: '13px', color: L.red }}>{err}</span>}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={() => call(false)} disabled={busy || !it.some(r => r.description.trim())}
          style={{ padding: '12px 20px', borderRadius: '10px', background: L.ink, color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: F.sans, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Checking…' : 'Review changes'}
        </button>
        <button onClick={() => { setOpen(false); setPreview(null); setErr('') }} disabled={busy}
          style={{ padding: '12px 18px', borderRadius: '10px', background: 'transparent', border: `1px solid ${L.line}`, fontSize: '14px', cursor: 'pointer', fontFamily: F.sans }}>
          Cancel
        </button>
      </div>

      </div>
      </div>
      )}
      {preview && <ConfirmSheet p={preview} busy={busy} err={err}
        onCancel={() => setPreview(null)} onConfirm={() => call(true)} />}
    </>
  )
}

function ConfirmSheet({ p, busy, err, onCancel, onConfirm }: { p: any; busy: boolean; err: string; onCancel: () => void; onConfirm: () => void }) {
  const d = p.diff || {}
  const chg = (g: any) => (g?.deleted?.length || 0) + (g?.inserted?.length || 0) + (g?.updated?.length || 0)
  const nothing = chg(d.items) + chg(d.adjustments) === 0 && !p.category_changed && p.before.hst === p.after.hst
  const sync = p.expenses_to_sync || []

  const line = (label: string, body: React.ReactNode, colour?: string) => (
    <div style={{ display: 'flex', gap: '10px', fontSize: '13px', padding: '5px 0' }}>
      <span style={{ color: colour || L.inkMuted, minWidth: '68px' }}>{label}</span>
      <span style={{ flex: 1 }}>{body}</span>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'oklch(0.25 0.01 60 / 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', zIndex: 60 }}>
      <div style={{ ...cardStyle, borderRadius: '18px', padding: '26px', width: '620px', maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={microLabel}>Confirm the edit</span>
          <span style={{ fontFamily: F.serif, fontSize: '26px' }}>{p.invoice.title}</span>
        </div>

        {nothing && <span style={{ fontSize: '13px', color: L.inkMuted }}>Nothing has changed.</span>}

        {(chg(d.items) > 0 || chg(d.adjustments) > 0) && (
          <div style={{ background: L.cardAlt, borderRadius: '12px', padding: '16px' }}>
            <span style={microLabel}>Rows</span>
            <div style={{ marginTop: '7px' }}>
              {d.items?.inserted?.map((r: any) => line('added', <>{r.description} <strong style={{ fontFamily: F.mono }}>{money(r.amount)}</strong></>, 'oklch(0.42 0.11 155)'))}
              {d.items?.updated?.map((r: any) => line('changed', <>{r.description} <span style={{ fontFamily: F.mono }}>{money(r.was.amount)} → <strong>{money(r.amount)}</strong></span></>, L.amber))}
              {d.items?.deleted?.map((r: any) => line('removed', <span style={{ textDecoration: 'line-through', color: L.inkMuted }}>{r.description} {money(r.amount)}</span>, L.red))}
              {d.adjustments?.inserted?.map((r: any) => line('held back', <>{r.description} <strong style={{ fontFamily: F.mono }}>−{money(r.amount)}</strong></>, L.amber))}
              {d.adjustments?.updated?.map((r: any) => line('changed', <>{r.description} <span style={{ fontFamily: F.mono }}>−{money(r.was.amount)} → <strong>−{money(r.amount)}</strong></span></>, L.amber))}
              {d.adjustments?.deleted?.map((r: any) => line('released', <span style={{ textDecoration: 'line-through', color: L.inkMuted }}>{r.description} −{money(r.amount)}</span>, 'oklch(0.42 0.11 155)'))}
            </div>
          </div>
        )}

        <div style={{ background: L.cardAlt, borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
          <span style={microLabel}>The arithmetic</span>
          <div style={{ display: 'flex' }}><span style={{ color: L.inkMuted }}>Line items</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(p.before.items)} → <strong>{money(p.after.items)}</strong></span></div>
          {(p.before.adjustments > 0 || p.after.adjustments > 0) &&
            <div style={{ display: 'flex' }}><span style={{ color: L.inkMuted }}>Held back</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>−{money(p.before.adjustments)} → <strong>−{money(p.after.adjustments)}</strong></span></div>}
          {(p.before.hst > 0 || p.after.hst > 0) &&
            <div style={{ display: 'flex' }}><span style={{ color: L.inkMuted }}>HST</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(p.before.hst)} → <strong>{money(p.after.hst)}</strong></span></div>}
          <div style={{ height: '1px', background: L.lineSoft }} />
          <div style={{ display: 'flex', fontSize: '14px' }}><span>Total</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(p.before.total)} → <strong>{money(p.after.total)}</strong></span></div>
          <div style={{ display: 'flex' }}><span style={{ color: L.inkMuted }}>Paid — unchanged</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(p.paid)}</span></div>
          <div style={{ display: 'flex' }}><span style={{ color: L.inkMuted }}>Outstanding</span><span style={{ marginLeft: 'auto', fontFamily: F.mono, color: p.balance > 0.005 ? L.red : L.ink }}><strong>{money(p.balance)}</strong></span></div>
        </div>

        {p.category_changed && (
          <div style={{ background: sync.length ? L.amberWash : L.cardAlt, border: `1px solid ${sync.length ? L.amberLine : 'transparent'}`, borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            <span style={microLabel}>Category · {p.before.category || 'none'} → {p.after.category}</span>
            {sync.length === 0 && <span style={{ color: L.inkMuted }}>No linked expense needs changing.</span>}
            {sync.length > 0 && <>
              <span>{sync.length} linked expense{sync.length > 1 ? 's' : ''} will be re-categorised in the same transaction:</span>
              {sync.map((e: any) => (
                <div key={e.id} style={{ display: 'flex', gap: '10px', fontFamily: F.mono, fontSize: '12px' }}>
                  <span style={{ color: L.inkMuted }}>{e.date}</span>
                  <span>{money(e.amount)}</span>
                  <span style={{ marginLeft: 'auto', color: L.inkBody }}>{e.from} → {p.after.category}</span>
                </div>
              ))}
              <span style={{ color: L.inkMuted, fontSize: '12px', lineHeight: 1.5 }}>
                Amounts are not touched. An expense records money that already left the account.
              </span>
            </>}
            {p.unlinked_paid_payments?.length > 0 && (
              <span style={{ color: L.red, fontSize: '12px', lineHeight: 1.5 }}>
                {p.unlinked_paid_payments.length} paid payment{p.unlinked_paid_payments.length > 1 ? 's have' : ' has'} no linked expense and will NOT be re-categorised.
              </span>
            )}
          </div>
        )}

        {p.category_normalised && (
          <span style={{ fontSize: '12px', color: L.amber }}>
            Category “{p.category_normalised.from}” isn’t a CRA category — saving as “{p.category_normalised.to}”.
          </span>
        )}

        {(err || p.overpaid) && <span style={{ fontSize: '13px', color: L.red }}>{err || p.error}</span>}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onConfirm} disabled={busy || nothing || p.overpaid}
            style={{ padding: '12px 20px', borderRadius: '10px', background: (nothing || p.overpaid) ? L.line : L.ink, color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: (nothing || p.overpaid) ? 'not-allowed' : 'pointer', fontFamily: F.sans, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Saving…' : 'Save the edit'}
          </button>
          <button onClick={onCancel} disabled={busy}
            style={{ padding: '12px 18px', borderRadius: '10px', background: 'transparent', border: `1px solid ${L.line}`, fontSize: '14px', cursor: 'pointer', fontFamily: F.sans }}>
            Back
          </button>
        </div>
      </div>
    </div>
  )
}
