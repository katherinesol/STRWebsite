'use client'
import { useState } from 'react'
import { L, F, microLabel, cardStyle } from '@/lib/design-tokens'
import { PROPERTY_OPTIONS } from '@/lib/property-options'
import { EXPENSE_CATEGORIES } from '@/lib/expense-categories'

/*  Who the invoice is with, and what it is for.
 *
 *  None of this was editable on the redesigned screen — the rebuild did the
 *  payment panel and the line items and left the invoice's identity behind, so
 *  changing a contractor's phone number meant going back to the legacy page.
 *  `notes` is worse than uneditable: the column exists, the API has always
 *  accepted it, and no screen has ever rendered it. All eleven invoices have it
 *  null because there has never been anywhere to type one.
 *
 *  IT WRITES THROUGH THE HEADER-ONLY PATCH, NEVER THROUGH save.
 *  /api/admin/invoices/save is a full replace: it deletes every item, adjustment
 *  and payment missing from the posted arrays, and the expenses linked to any
 *  deleted payment. Sending identity fields there — with no items array, because
 *  this form has no items — would erase the invoice's money to change a phone
 *  number. PATCH /api/admin/invoices/[id] touches the invoices row and nothing
 *  else, which is why it is the one used here.
 *
 *  The property list is imported, not declared. Three hand-maintained copies are
 *  how 'royal-york' and 'royal-york-both' came to mean the same thing in
 *  different places; a fourth would be a fourth way to disagree. */

const FIELDS = ['contractor_name', 'company', 'contractor_contact', 'title', 'property_id', 'category', 'due_date', 'notes'] as const

export default function InvoiceIdentityEditor({ invoice, onSaved }: { invoice: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  function start() {
    setF(Object.fromEntries(FIELDS.map(k => [k, invoice[k] ?? ''])))
    setErr(''); setOpen(true)
  }

  async function save() {
    if (!f.title?.trim()) { setErr('A title is required.'); return }
    if (!f.contractor_name?.trim() && !f.company?.trim()) { setErr('A contractor or a company is required.'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/admin/invoices/${invoice.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(FIELDS.map(k => [k, (f[k] ?? '') === '' ? null : f[k]]))),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error || 'Could not save'); return }
      setOpen(false); onSaved()
    } catch (e: any) { setErr(e?.message || 'Could not save') }
    finally { setBusy(false) }
  }

  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

  if (!open) {
    return (
      <button onClick={start} style={{
        padding: '7px 14px', borderRadius: '99px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
        fontFamily: F.sans, background: L.card, color: L.ink, border: `1px solid ${L.line}`,
      }}>Edit details</button>
    )
  }

  return (
    <div style={{ ...cardStyle, padding: '20px', marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '13px' }}>
      <span style={{ ...microLabel }}>Invoice details</span>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
        <Field label="Title" value={f.title} onChange={(v: string) => set('title', v)} placeholder="Kitchen reno" />
        <Field label="Contractor" value={f.contractor_name} onChange={(v: string) => set('contractor_name', v)} placeholder="Nikola" />
        <Field label="Company" value={f.company} onChange={(v: string) => set('company', v)} placeholder="optional" />
        <Field label="Contact" value={f.contractor_contact} onChange={(v: string) => set('contractor_contact', v)} placeholder="phone or email" />
        <label style={col}><span style={microLabel}>Property</span>
          <select value={f.property_id ?? ''} onChange={e => set('property_id', e.target.value)} style={input}>
            {PROPERTY_OPTIONS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
        <label style={col}><span style={microLabel}>Category</span>
          <select value={f.category ?? ''} onChange={e => set('category', e.target.value)} style={input}>
            <option value="">Uncategorised</option>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select></label>
        <Field label="Due" value={f.due_date} onChange={(v: string) => set('due_date', v)} placeholder="completion, or a date" />
      </div>

      <label style={col}><span style={microLabel}>Note</span>
        <textarea value={f.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={3}
          placeholder="Anything worth remembering about this invoice — what was agreed, what is still owed, why an amount differs."
          style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} /></label>

      {err && <div style={{ fontSize: '13px', color: L.red }}>{err}</div>}

      <div style={{ display: 'flex', gap: '9px', alignItems: 'center' }}>
        <button onClick={save} disabled={busy} style={{
          padding: '8px 16px', borderRadius: '99px', fontSize: '13px', fontWeight: 600, border: 'none',
          fontFamily: F.sans, background: busy ? L.line : L.ink, color: busy ? L.inkFaint : '#fff',
          cursor: busy ? 'wait' : 'pointer',
        }}>{busy ? 'Saving…' : 'Save details'}</button>
        <button onClick={() => setOpen(false)} style={{
          padding: '8px 14px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer',
          fontFamily: F.sans, background: L.card, color: L.ink, border: `1px solid ${L.line}`,
        }}>Cancel</button>
        <span style={{ fontSize: '12px', color: L.inkFaint }}>
          Details only — line items, payments and their expenses are untouched.
        </span>
      </div>
    </div>
  )
}

const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '5px' }
const input: React.CSSProperties = {
  padding: '8px 11px', fontSize: '13px', border: `1px solid ${L.line}`,
  borderRadius: '7px', background: L.card, color: L.ink, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
}
function Field({ label, value, onChange, placeholder }: any) {
  return (
    <label style={col}><span style={microLabel}>{label}</span>
      <input value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={input} /></label>
  )
}
