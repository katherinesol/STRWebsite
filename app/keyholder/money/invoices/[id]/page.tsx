'use client'
import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import MethodPicker, { DETAILED } from '@/components/admin/MethodPicker'
import { L, F, microLabel, cardStyle, money } from '@/lib/design-tokens'
import InvoiceLineEditor from '@/components/keyholder/InvoiceLineEditor'

const PROP_NAMES: Record<string, string> = {
  'royal-york': 'Royal York', 'royal-york-west': 'Royal York West',
  'royal-york-east': 'Royal York East', 'nickel-beach': 'Nickel Beach',
}
const propName = (p: string | null) => (p ? PROP_NAMES[p] || p : 'No property set')
const today = () => new Date().toISOString().split('T')[0]

type Draft = {
  action: 'settle' | 'log'
  paymentId: string          // client-generated → double-click collides on the PK
  expenseId: string
  amount: string
  paidAt: string
  method: string
  methodDetail: string
  methodLast4: string
  createExpense: boolean
  planned?: any
}

export default function InvoiceEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [result, setResult] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = () => fetch(`/api/admin/invoices/${id}`).then(r => r.json()).then(setD).catch(() => {})
  useEffect(() => { load().finally(() => setLoading(false)) }, [id])

  if (loading) return <div style={{ padding: '44px 0', color: L.inkMuted }}>Reading invoice…</div>
  if (!d?.invoice) return <div style={{ padding: '44px 0', color: L.red }}>Invoice not found.</div>

  const inv = d.invoice
  const items = d.items || []
  const adjustments = d.adjustments || []
  const payments = d.payments || []
  const n = (v: any) => Number(v) || 0

  // line items − held back + HST = total ; owing = total − paid (planned is NOT paid)
  const lineItems = Math.round(items.reduce((s: number, x: any) => s + n(x.amount), 0) * 100) / 100
  const heldBack = Math.round(adjustments.reduce((s: number, x: any) => s + n(x.amount), 0) * 100) / 100
  const hst = n(inv.hst_amount)
  const total = Math.round((lineItems - heldBack + hst) * 100) / 100
  const settled = payments.filter((p: any) => p.status === 'paid')
  const planned = payments.filter((p: any) => p.status === 'planned')
  const paid = Math.round(settled.reduce((s: number, p: any) => s + n(p.amount), 0) * 100) / 100
  const scheduled = Math.round(planned.reduce((s: number, p: any) => s + n(p.amount), 0) * 100) / 100
  const outstanding = Math.round((total - paid) * 100) / 100

  const openSettle = (p: any) => { setResult(null); setErr(''); setDraft({
    action: 'settle', paymentId: p.id, expenseId: crypto.randomUUID(),
    amount: String(p.amount), paidAt: today(), method: p.method || '',
    methodDetail: p.method_detail || '', methodLast4: p.method_last4 || '',
    createExpense: !p.expense_created, planned: p,
  }) }
  const openLog = () => { setResult(null); setErr(''); setDraft({
    action: 'log', paymentId: crypto.randomUUID(), expenseId: crypto.randomUUID(),
    amount: '', paidAt: today(), method: 'etransfer', methodDetail: '', methodLast4: '', createExpense: true,
  }) }

  async function commit() {
    if (!draft) return
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/invoices/payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: draft.action, invoice_id: id, payment_id: draft.paymentId,
          expense_id: draft.expenseId, create_expense: draft.createExpense,
          amount: draft.action === 'log' ? Number(draft.amount) : undefined,
          paid_at: draft.paidAt, method: draft.method || null,
          method_detail: DETAILED.includes(draft.method) ? (draft.methodDetail || null) : null,
          method_last4:  DETAILED.includes(draft.method) ? (draft.methodLast4 || null) : null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || 'Could not record the payment'); return }
      setResult(j); setDraft(null); await load()
    } catch { setErr('Could not record the payment') }
    finally { setBusy(false) }
  }

  const draftAmount = draft?.action === 'settle' ? n(draft.amount) : Number(draft?.amount) || 0
  const afterPaid = Math.round((paid + draftAmount) * 100) / 100
  const afterOutstanding = Math.round((total - afterPaid) * 100) / 100

  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 0', borderBottom: `1px solid ${L.lineFaint}`, fontSize: '14px' }

  return (
    <div style={{ paddingTop: '24px' }}>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '24px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <Link href="/keyholder/money/invoices" style={{ fontSize: '13px', color: L.inkMuted, textDecoration: 'none' }}>← Invoices</Link>
          <span style={{ fontFamily: F.serif, fontSize: '36px', lineHeight: 1 }}>
            {inv.title}{inv.contractor_name ? ` · ${inv.contractor_name}` : ''}
          </span>
          <span style={{ fontSize: '14px', color: L.inkBody }}>
            {propName(inv.property_id)} · {inv.category || 'uncategorised'} · created {String(inv.created_at).slice(0, 10)}
          </span>
        </div>
        <span style={{
          marginLeft: 'auto', padding: '8px 14px', borderRadius: '99px', fontSize: '13px', fontWeight: 600,
          background: outstanding > 0.005 ? 'oklch(0.965 0.02 30)' : 'oklch(0.94 0.05 155)',
          color: outstanding > 0.005 ? L.red : 'oklch(0.38 0.10 155)',
        }}>{outstanding > 0.005 ? `${money(outstanding)} outstanding` : 'Paid in full'}</span>
      </div>

      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

        <div style={{ flex: '1 1 560px', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

          <div style={{ ...cardStyle, padding: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600 }}>Line items</span>
              <div style={{ marginLeft: 'auto' }}>
                <InvoiceLineEditor invoice={inv} items={items} adjustments={adjustments} onSaved={load} />
              </div>
            </div>
            <div style={{ marginTop: '10px' }}>
              {items.length === 0 && <span style={{ fontSize: '13px', color: L.inkMuted }}>No line items.</span>}
              {items.map((i: any) => (
                <div key={i.id} style={row}>
                  <span>{i.description || '—'}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(i.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          {adjustments.length > 0 && (
            <div style={{ ...cardStyle, padding: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600 }}>Held back</span>
                <span style={{ fontSize: '13px', color: L.inkMuted }}>comes off the total</span>
              </div>
              <div style={{ marginTop: '10px' }}>
                {adjustments.map((a: any) => (
                  <div key={a.id} style={{ ...row, background: L.amberWash, padding: '11px 14px', borderRadius: '10px', borderBottom: 'none', marginBottom: '6px' }}>
                    <span style={{ color: L.amber }}>{a.description || a.reason || 'Adjustment'}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: F.mono, color: 'oklch(0.45 0.12 30)' }}>−{money(a.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ ...cardStyle, padding: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600 }}>Payments</span>
              <span style={{ fontSize: '13px', color: L.inkMuted }}>
                {settled.length} paid{planned.length > 0 ? ` · ${planned.length} scheduled` : ''}
              </span>
              <button onClick={openLog} style={{
                marginLeft: 'auto', padding: '9px 15px', borderRadius: '9px', background: L.ink,
                color: '#fff', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: F.sans,
              }}>Log a payment</button>
            </div>

            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {payments.length === 0 && <span style={{ fontSize: '13px', color: L.inkMuted }}>Nothing recorded yet.</span>}
              {payments.map((p: any) => {
                const isPlanned = p.status === 'planned'
                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '10px', fontSize: '14px',
                    background: isPlanned ? L.amberWash : 'oklch(0.968 0.03 155)',
                    border: `1px solid ${isPlanned ? L.amberLine : 'transparent'}`,
                  }}>
                    <span style={{ fontFamily: F.mono }}>{money(p.amount)}</span>
                    <span style={{ color: L.inkBody, fontSize: '13px' }}>
                      {p.method || 'payment'}{p.method_detail ? ` · ${p.method_detail}` : ''}{p.method_last4 ? ` ···${p.method_last4}` : ''}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 600, color: isPlanned ? L.amber : 'oklch(0.38 0.10 155)' }}>
                      {isPlanned ? `scheduled${p.due_date ? ` for ${p.due_date}` : ''} — not yet paid` : `paid ${p.paid_at || ''}`}
                    </span>
                    {isPlanned && (
                      <button onClick={() => openSettle(p)} style={{
                        padding: '8px 13px', borderRadius: '8px', background: L.ink, color: '#fff',
                        fontSize: '12px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: F.sans,
                      }}>Mark paid</button>
                    )}
                    {!isPlanned && p.expense_created && (
                      <span style={{ fontSize: '11px', color: L.inkMuted }}>expense logged</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* the arithmetic, beside the form rather than under it */}
        <div style={{ width: '344px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ ...cardStyle, borderRadius: '18px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>The arithmetic</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <div style={{ display: 'flex' }}><span style={{ color: L.inkMuted }}>Line items</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(lineItems)}</span></div>
              {heldBack > 0 && <div style={{ display: 'flex' }}><span style={{ color: L.inkMuted }}>Held back</span><span style={{ marginLeft: 'auto', fontFamily: F.mono, color: 'oklch(0.45 0.12 30)' }}>−{money(heldBack)}</span></div>}
              <div style={{ display: 'flex' }}><span style={{ color: L.inkMuted }}>HST</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{hst ? money(hst) : 'no tax'}</span></div>
              <div style={{ height: '1px', background: L.lineSoft }} />
              <div style={{ display: 'flex', fontSize: '14px' }}><span>Total</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(total)}</span></div>
              <div style={{ display: 'flex' }}><span style={{ color: L.inkMuted }}>Paid</span><span style={{ marginLeft: 'auto', fontFamily: F.mono, color: 'oklch(0.42 0.11 155)' }}>{money(paid)}</span></div>
              {scheduled > 0 && (
                <div style={{ display: 'flex' }}>
                  <span style={{ color: L.amber }}>Scheduled</span>
                  <span style={{ marginLeft: 'auto', fontFamily: F.mono, color: L.amber }}>{money(scheduled)}</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', paddingTop: '14px', borderTop: `1px solid ${L.lineSoft}` }}>
              <span style={{ fontSize: '15px', fontWeight: 600 }}>Outstanding</span>
              <span style={{ marginLeft: 'auto', fontFamily: F.serif, fontSize: '30px', color: outstanding > 0.005 ? L.red : L.ink }}>{money(outstanding)}</span>
            </div>
            {scheduled > 0 && (
              <span style={{ fontSize: '12px', color: L.amber, lineHeight: 1.5 }}>
                {money(scheduled)} is scheduled but has not moved — it is not counted as paid.
              </span>
            )}
          </div>

          {inv.share_token && (
            <div style={{ ...cardStyle, borderRadius: '18px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600 }}>Contractor link</span>
              <span style={{ fontSize: '12px', color: L.inkMuted, lineHeight: 1.5 }}>
                Opens the invoice, the deduction and what was paid — no login.
              </span>
              <span style={{ fontFamily: F.mono, fontSize: '11px', color: L.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '10px 12px', border: `1px solid ${L.line}`, borderRadius: '10px' }}>
                /invoice/{inv.share_token}
              </span>
              {inv.acknowledged_at && <span style={{ fontSize: '12px', color: L.inkMuted }}>Acknowledged {String(inv.acknowledged_at).slice(0, 10)}</span>}
            </div>
          )}
        </div>
      </div>

      {/* confirm — nothing is written until this is accepted */}
      {draft && (
        <div style={{ position: 'fixed', inset: 0, background: 'oklch(0.25 0.01 60 / 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', zIndex: 50 }}>
          <div style={{ ...cardStyle, borderRadius: '18px', padding: '26px', width: '520px', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={{ ...microLabel }}>{draft.action === 'settle' ? 'Mark scheduled payment as paid' : 'Log a payment already made'}</span>
              <span style={{ fontFamily: F.serif, fontSize: '26px' }}>{inv.title}</span>
            </div>

            {draft.action === 'log' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <div style={microLabel}>Amount</div>
                  <input type="number" value={draft.amount} min="0" step="0.01" autoFocus
                    onChange={e => setDraft({ ...draft, amount: e.target.value })}
                    style={{ width: '100%', padding: '11px 13px', border: `1px solid ${L.line}`, borderRadius: '10px', fontSize: '14px', fontFamily: F.sans, marginTop: '5px' }} />
                </div>
                <div>
                  <div style={microLabel}>Method</div>
                  <select value={draft.method} onChange={e => setDraft({ ...draft, method: e.target.value })}
                    style={{ width: '100%', padding: '11px 13px', border: `1px solid ${L.line}`, borderRadius: '10px', fontSize: '14px', fontFamily: F.sans, marginTop: '5px', background: '#fff' }}>
                    {['etransfer', 'billpay', 'card', 'cash', 'cheque'].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Which bank or card. One implementation, shared with the
                mark-paid flow — see components/admin/MethodPicker.tsx. */}
            <MethodPicker method={draft.method} detail={draft.methodDetail} last4={draft.methodLast4}
              onChange={(d, l) => setDraft({ ...draft, methodDetail: d, methodLast4: l })} />

            <div>
              <div style={microLabel}>Paid on</div>
              <input type="date" value={draft.paidAt} onChange={e => setDraft({ ...draft, paidAt: e.target.value })}
                style={{ padding: '11px 13px', border: `1px solid ${L.line}`, borderRadius: '10px', fontSize: '14px', fontFamily: F.sans, marginTop: '5px' }} />
            </div>

            {/* before → after */}
            <div style={{ background: L.cardAlt, borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '9px', fontSize: '13px' }}>
              <span style={microLabel}>What changes</span>
              <div style={{ display: 'flex' }}>
                <span style={{ color: L.inkMuted }}>Paid</span>
                <span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(paid)} → <strong>{money(afterPaid)}</strong></span>
              </div>
              <div style={{ display: 'flex' }}>
                <span style={{ color: L.inkMuted }}>Outstanding</span>
                <span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(outstanding)} → <strong>{money(afterOutstanding)}</strong></span>
              </div>
              {draft.action === 'settle' && (
                <div style={{ display: 'flex' }}>
                  <span style={{ color: L.inkMuted }}>Scheduled</span>
                  <span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(scheduled)} → <strong>{money(Math.round((scheduled - draftAmount) * 100) / 100)}</strong></span>
                </div>
              )}
              {afterOutstanding < -0.005 && (
                <span style={{ color: L.red, fontSize: '12px' }}>This would overpay the invoice by {money(Math.abs(afterOutstanding))}.</span>
              )}
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '13px', lineHeight: 1.5 }}>
              <input type="checkbox" checked={draft.createExpense} onChange={e => setDraft({ ...draft, createExpense: e.target.checked })} style={{ marginTop: '3px' }} />
              <span>
                Also log as expense (<strong>{money(draftAmount)}</strong>, {inv.category || 'Repairs & maintenance'}, {inv.contractor_name || inv.title})
                <span style={{ display: 'block', color: L.inkMuted, fontSize: '12px' }}>
                  {draft.createExpense ? 'An expense row will be created.' : 'No expense will be created — the payment is recorded on its own.'}
                </span>
              </span>
            </label>

            {err && <span style={{ fontSize: '13px', color: L.red }}>{err}</span>}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={commit} disabled={busy || (draft.action === 'log' && !(Number(draft.amount) > 0))}
                style={{ padding: '12px 20px', borderRadius: '10px', background: L.ink, color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: F.sans, opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Recording…' : draft.action === 'settle' ? 'Mark it paid' : 'Record the payment'}
              </button>
              <button onClick={() => setDraft(null)} disabled={busy}
                style={{ padding: '12px 18px', borderRadius: '10px', background: 'transparent', border: `1px solid ${L.line}`, fontSize: '14px', cursor: 'pointer', fontFamily: F.sans }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div style={{ ...cardStyle, border: `1px solid ${L.amberLine}`, background: L.amberWash, borderRadius: '14px', padding: '16px 20px', marginTop: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '14px' }}>
            {result.already
              ? 'Already recorded — nothing was written twice.'
              : `Recorded ${money(result.amount)}. Outstanding ${money(result.before.outstanding)} → ${money(result.after.outstanding)}.`}
            {result.expense && <> Expense logged.</>}
            {!result.expense && !result.already && <> No expense created.</>}
          </span>
          <button onClick={() => setResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: L.inkMuted, cursor: 'pointer', fontSize: '13px', fontFamily: F.sans }}>Dismiss</button>
        </div>
      )}
    </div>
  )
}
