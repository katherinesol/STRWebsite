'use client'
import { useState } from 'react'
import { L, F, microLabel, money } from '@/lib/design-tokens'
import type { TaxMode } from '@/components/admin/TaxRatePicker'

/*  What a receipt says, offered field by field — never applied over you.
 *
 *  The extract endpoint returns NO confidence, per-field or overall: a guess and
 *  a certainty come back identical. So the human review IS the confidence check,
 *  and it has to be granular. The legacy screen got the timing right — nothing
 *  fills until you press Apply — but then overwrote: contractor, company,
 *  category and HST all took the extracted value over whatever you had typed,
 *  and line items appended blindly. A misread quietly replaced a correct value.
 *
 *  Here every field is a tick. Anything you have already typed defaults to OFF,
 *  anything empty defaults to ON, and line items tick individually so a phantom
 *  row can be dropped without discarding the rest. Nothing you wrote changes
 *  unless you say so.
 *
 *  THE TAX READING IS CHECKED, NOT COPIED. An HST that is 13% of the subtotal is
 *  a normal job and becomes auto mode at 13%. Anything else is kept as a typed
 *  amount AND the discrepancy is named — "reads 11.4% of the subtotal" — because
 *  that is the 11%-instead-of-13% error surfacing at entry rather than in a
 *  reconciliation nine months later.
 *
 *  The total is a cross-check and fills nothing. If it disagrees with the lines
 *  plus tax, the read is internally inconsistent and at least one number on this
 *  panel is wrong. */

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100
const n = (v: any) => Number(v) || 0

export type Picks = {
  contractor_name?: string; company?: string; category?: string; title?: string
  items?: { description: string; amount: string }[]
  tax?: { mode: TaxMode; rate: string; amount: string }
  payDate?: string
}

export function readTax(items: any[], hst: any) {
  const subtotal = r2((items || []).reduce((s, i) => s + n(i.amount), 0))
  if (hst == null || subtotal <= 0) return null
  const amount = r2(n(hst))
  const at13 = r2(subtotal * 0.13)
  const pct = subtotal > 0 ? (amount / subtotal) * 100 : 0
  if (Math.abs(amount - at13) <= 0.01) {
    return { mode: 'auto' as TaxMode, rate: '13', amount: String(amount), subtotal, pct,
      note: `${money(amount)} is 13% of ${money(subtotal)} — the usual rate.` }
  }
  return { mode: 'manual' as TaxMode, rate: '13', amount: String(amount), subtotal, pct,
    note: `HST reads ${money(amount)}, which is ${pct.toFixed(1)}% of ${money(subtotal)} — kept as a typed amount. 13% would be ${money(at13)}.` }
}

export default function ExtractReview({ extracted, current, onApply, onDiscard }: {
  extracted: any
  current: { contractor_name: string; company: string; category: string; title: string; itemCount: number }
  onApply: (p: Picks) => void
  onDiscard: () => void
}) {
  const items: any[] = Array.isArray(extracted.items) ? extracted.items : []
  const tax = readTax(items, extracted.hst)
  const subtotal = r2(items.reduce((s, i) => s + n(i.amount), 0))
  const impliedTotal = r2(subtotal + (tax ? n(tax.amount) : 0))
  const statedTotal = extracted.total != null ? r2(n(extracted.total)) : null
  const totalMismatch = statedTotal != null && Math.abs(statedTotal - impliedTotal) > 0.01

  // empty field → offered ticked; a field you already filled → offered unticked
  const [on, setOn] = useState<Record<string, boolean>>({
    contractor_name: !current.contractor_name && !!extracted.contractor_name,
    company: !current.company && !!extracted.company,
    category: !current.category && !!extracted.category,
    title: !current.title && !!extracted.contractor_name,
    tax: !!tax,
    payDate: false,
  })
  const [itemOn, setItemOn] = useState<boolean[]>(items.map(() => true))
  const flip = (k: string) => setOn(p => ({ ...p, [k]: !p[k] }))
  const suggestedTitle = extracted.contractor_name ? `${extracted.contractor_name} work` : ''

  function apply() {
    const p: Picks = {}
    if (on.contractor_name && extracted.contractor_name) p.contractor_name = extracted.contractor_name
    if (on.company && extracted.company) p.company = extracted.company
    if (on.category && extracted.category) p.category = extracted.category
    if (on.title && suggestedTitle) p.title = suggestedTitle
    const picked = items.filter((_, i) => itemOn[i]).map(i => ({ description: String(i.description || ''), amount: String(n(i.amount)) }))
    if (picked.length) p.items = picked
    if (on.tax && tax) p.tax = { mode: tax.mode, rate: tax.rate, amount: tax.amount }
    if (on.payDate && extracted.date) p.payDate = extracted.date
    onApply(p)
  }

  const Row = ({ k, label, was, now }: { k: string; label: string; was: string; now: string }) => {
    if (!now) return null
    return (
      <label style={rowS}>
        <input type="checkbox" checked={!!on[k]} onChange={() => flip(k)} style={{ marginTop: '3px' }} />
        <span style={{ flex: 1 }}>
          <span style={microLabel}>{label}</span>
          <span style={{ display: 'block', fontSize: '13px', color: L.ink }}>
            {was ? <><span style={{ color: L.inkFaint, textDecoration: on[k] ? 'line-through' : 'none' }}>{was}</span> <span style={{ color: L.inkFaint }}>→</span> </> : null}
            <strong>{now}</strong>
          </span>
          {was && <span style={{ display: 'block', fontSize: '12px', color: L.inkFaint }}>
            You already typed this — leave it unticked to keep yours.
          </span>}
        </span>
      </label>
    )
  }

  return (
    <div style={{ background: L.amberWash, border: `1px solid ${L.amberLine}`, borderRadius: '12px', padding: '16px 18px' }}>
      <div style={{ ...microLabel, color: L.amber, marginBottom: '3px' }}>What the receipt says</div>
      <div style={{ fontSize: '13px', color: L.inkBody, marginBottom: '12px', lineHeight: 1.5 }}>
        Nothing is filled in until you apply, and only the ticked lines are used. There is no
        confidence score behind any of this — your eye is the check.
      </div>

      <Row k="contractor_name" label="Contractor" was={current.contractor_name} now={extracted.contractor_name || ''} />
      <Row k="company" label="Company" was={current.company} now={extracted.company || ''} />
      <Row k="category" label="Category" was={current.category} now={extracted.category || ''} />
      <Row k="title" label="Title" was={current.title} now={suggestedTitle} />

      {items.length > 0 && (
        <div style={{ ...rowS, alignItems: 'flex-start' }}>
          <span style={{ width: '13px' }} />
          <span style={{ flex: 1 }}>
            <span style={microLabel}>
              Line items — {items.length} read{current.itemCount > 0 ? `, added to the ${current.itemCount} already here` : ''}
            </span>
            {items.map((it, i) => (
              <label key={i} style={{ display: 'flex', gap: '9px', alignItems: 'center', padding: '3px 0', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={itemOn[i]} onChange={() => setItemOn(p => p.map((v, x) => x === i ? !v : v))} />
                <span style={{ flex: 1, color: L.ink }}>{it.description || '(no description)'}</span>
                <span style={{ fontFamily: F.mono }}>{money(n(it.amount))}</span>
              </label>
            ))}
            <span style={{ display: 'block', fontSize: '12px', color: L.inkFaint, marginTop: '3px' }}>
              Subtotal of the ticked lines: {money(r2(items.filter((_, i) => itemOn[i]).reduce((s, i2) => s + n(i2.amount), 0)))}
            </span>
          </span>
        </div>
      )}

      {tax && (
        <label style={rowS}>
          <input type="checkbox" checked={!!on.tax} onChange={() => flip('tax')} style={{ marginTop: '3px' }} />
          <span style={{ flex: 1 }}>
            <span style={microLabel}>Tax</span>
            <span style={{ display: 'block', fontSize: '13px', color: L.ink }}>
              {tax.mode === 'auto' ? 'HST 13%' : `Typed amount ${money(n(tax.amount))}`}
            </span>
            <span style={{ display: 'block', fontSize: '12px', color: tax.mode === 'auto' ? L.inkFaint : L.amber, marginTop: '2px' }}>
              {tax.note}
            </span>
          </span>
        </label>
      )}

      {extracted.date && (
        <label style={rowS}>
          <input type="checkbox" checked={!!on.payDate} onChange={() => flip('payDate')} style={{ marginTop: '3px' }} />
          <span style={{ flex: 1 }}>
            <span style={microLabel}>Date on the invoice</span>
            <span style={{ display: 'block', fontSize: '13px', color: L.ink }}>{extracted.date}</span>
            <span style={{ display: 'block', fontSize: '12px', color: L.inkFaint }}>
              Used as the payment date if you record one. Not the due date — an invoice's date is when it was billed.
            </span>
          </span>
        </label>
      )}

      {totalMismatch && (
        <div style={{ background: L.card, border: `1px solid ${L.amberLine}`, borderRadius: '9px', padding: '10px 12px', margin: '10px 0 0', fontSize: '13px', color: L.inkBody, lineHeight: 1.5 }}>
          ⚠ The total reads <strong>{money(statedTotal!)}</strong>, but the lines and tax come to{' '}
          <strong>{money(impliedTotal)}</strong> — {money(Math.abs(r2(statedTotal! - impliedTotal)))} unaccounted.
          Something on this receipt was read wrongly; check before applying.
        </div>
      )}

      <div style={{ display: 'flex', gap: '9px', marginTop: '14px' }}>
        <button onClick={apply} style={btn(true)}>Apply the ticked</button>
        <button onClick={onDiscard} style={btn(false)}>Discard</button>
      </div>
    </div>
  )
}

const rowS: React.CSSProperties = {
  display: 'flex', gap: '9px', alignItems: 'flex-start', padding: '8px 0',
  borderTop: `1px solid ${L.amberLine}`, cursor: 'pointer',
}
const btn = (primary: boolean): React.CSSProperties => ({
  padding: '8px 15px', borderRadius: '99px', fontSize: '13px', fontWeight: primary ? 600 : 400,
  cursor: 'pointer', fontFamily: F.sans, border: primary ? 'none' : `1px solid ${L.line}`,
  background: primary ? L.ink : L.card, color: primary ? '#fff' : L.ink,
})
