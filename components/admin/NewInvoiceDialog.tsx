'use client'
import { useState } from 'react'
import { L, F, microLabel, cardStyle, money } from '@/lib/design-tokens'

const PROPS = [
  { id: '', name: 'No property' },
  { id: 'royal-york', name: 'Royal York' },
  { id: 'royal-york-west', name: 'Royal York West' },
  { id: 'royal-york-east', name: 'Royal York East' },
  { id: 'nickel-beach', name: 'Nickel Beach' },
]
const CATEGORIES = ['Repairs & maintenance', 'Cleaning', 'Furnishings', 'Appliances', 'Utilities', 'Professional fees (legal/accounting)', 'Property taxes', 'Other expenses']
const METHODS = ['etransfer', 'billpay', 'card', 'cash', 'cheque']
const today = () => new Date().toISOString().split('T')[0]
const r2 = (v: number) => Math.round(v * 100) / 100

type Line = { id: string; description: string; amount: string; reason?: string }
const newLine = (): Line => ({ id: crypto.randomUUID(), description: '', amount: '' })

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 13px', border: `1px solid ${L.line}`,
  borderRadius: '10px', fontSize: '14px', fontFamily: F.sans, background: '#fff', boxSizing: 'border-box',
}

export default function NewInvoiceDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  // ids minted once, here — a repeat submit collides on the PK instead of writing twice
  const [ids] = useState(() => ({ invoice: crypto.randomUUID(), payment: crypto.randomUUID(), expense: crypto.randomUUID() }))
  const [step, setStep] = useState<'edit' | 'preview'>('edit')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [title, setTitle] = useState('')
  const [contractor, setContractor] = useState('')
  const [contact, setContact] = useState('')
  const [property, setProperty] = useState('royal-york-west')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [hst, setHst] = useState('')
  const [items, setItems] = useState<Line[]>([newLine()])
  const [adjustments, setAdjustments] = useState<Line[]>([])
  const [withPayment, setWithPayment] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('etransfer')
  const [payStatus, setPayStatus] = useState<'paid' | 'planned'>('paid')
  const [payDate, setPayDate] = useState(today())
  const [createExpense, setCreateExpense] = useState(true)

  const num = (s: string) => Number(s) || 0
  const validItems = items.filter(l => l.description.trim() && num(l.amount) > 0)
  const validAdj = adjustments.filter(l => l.description.trim() && num(l.amount) > 0)
  const lineTotal = r2(validItems.reduce((s, l) => s + num(l.amount), 0))
  const heldBack = r2(validAdj.reduce((s, l) => s + num(l.amount), 0))
  const hstAmt = r2(num(hst))
  const total = r2(lineTotal - heldBack + hstAmt)
  const payAmt = withPayment ? r2(num(payAmount)) : 0
  const paidNow = withPayment && payStatus === 'paid' ? payAmt : 0
  const outstanding = r2(total - paidNow)

  const canPreview = title.trim() && validItems.length > 0 && (!withPayment || payAmt > 0)

  async function create() {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/invoices/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: ids.invoice, title: title.trim(),
          contractor_name: contractor.trim() || null, contractor_contact: contact.trim() || null,
          property_id: property || null, category, hst_amount: hstAmt,
          items: validItems.map(l => ({ id: l.id, description: l.description.trim(), amount: num(l.amount) })),
          adjustments: validAdj.map(l => ({ id: l.id, description: l.description.trim(), amount: num(l.amount), reason: l.reason || 'other' })),
          payment: withPayment ? {
            id: ids.payment, amount: payAmt, method: payMethod, status: payStatus,
            paid_at: payStatus === 'paid' ? payDate : null,
            due_date: payStatus === 'planned' ? payDate : null,
          } : null,
          create_expense: withPayment && payStatus === 'paid' && createExpense,
          expense_id: ids.expense,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || 'Could not create the invoice'); return }
      onCreated()
    } catch { setErr('Could not create the invoice') }
    finally { setBusy(false) }
  }

  const lineRow = (l: Line, arr: Line[], set: (v: Line[]) => void, held: boolean) => (
    <div key={l.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
      <input value={l.description} placeholder={held ? 'Reason for holding back…' : 'What was done…'}
        onChange={e => set(arr.map(x => x.id === l.id ? { ...x, description: e.target.value } : x))}
        style={{ ...inputStyle, flex: 1 }} />
      <input type="number" value={l.amount} placeholder="0.00" min="0" step="0.01"
        onChange={e => set(arr.map(x => x.id === l.id ? { ...x, amount: e.target.value } : x))}
        style={{ ...inputStyle, width: '120px' }} />
      <button onClick={() => set(arr.filter(x => x.id !== l.id))}
        style={{ padding: '0 12px', border: `1px solid ${L.line}`, borderRadius: '10px', background: '#fff', color: L.inkMuted, cursor: 'pointer', fontFamily: F.sans }}>×</button>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'oklch(0.25 0.01 60 / 0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 24px', zIndex: 60, overflow: 'auto' }}>
      <div style={{ ...cardStyle, borderRadius: '18px', padding: '26px', width: '680px', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: '18px' }}>

        {step === 'edit' ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={microLabel}>New invoice</span>
              <span style={{ fontFamily: F.serif, fontSize: '28px' }}>Nothing is created until you confirm</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div><div style={microLabel}>Job</div><input value={title} autoFocus onChange={e => setTitle(e.target.value)} placeholder="Plaster repair" style={{ ...inputStyle, marginTop: '5px' }} /></div>
              <div><div style={microLabel}>Contractor</div><input value={contractor} onChange={e => setContractor(e.target.value)} placeholder="Manpreet Singh" style={{ ...inputStyle, marginTop: '5px' }} /></div>
              <div><div style={microLabel}>Property</div>
                <select value={property} onChange={e => setProperty(e.target.value)} style={{ ...inputStyle, marginTop: '5px' }}>
                  {PROPS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
              <div><div style={microLabel}>Category</div>
                <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputStyle, marginTop: '5px' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select></div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600 }}>Line items</span>
                <button onClick={() => setItems([...items, newLine()])} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: L.link, fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: F.sans }}>+ Add item</button>
              </div>
              {items.map(l => lineRow(l, items, setItems, false))}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600 }}>Held back</span>
                <span style={{ fontSize: '13px', color: L.inkMuted, marginLeft: '8px' }}>comes off the total</span>
                <button onClick={() => setAdjustments([...adjustments, newLine()])} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: L.link, fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: F.sans }}>+ Hold back</button>
              </div>
              {adjustments.map(l => lineRow(l, adjustments, setAdjustments, true))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '12px', alignItems: 'end' }}>
              <div><div style={microLabel}>HST</div><input type="number" value={hst} onChange={e => setHst(e.target.value)} placeholder="0.00" min="0" step="0.01" style={{ ...inputStyle, marginTop: '5px' }} /></div>
              <span style={{ fontSize: '13px', color: L.inkMuted, paddingBottom: '12px' }}>Leave blank if the contractor doesn&rsquo;t charge tax.</span>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
              <input type="checkbox" checked={withPayment} onChange={e => setWithPayment(e.target.checked)} />
              Record an initial payment now
            </label>

            {withPayment && (
              <div style={{ background: L.cardAlt, borderRadius: '12px', padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div><div style={microLabel}>Amount</div><input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" style={{ ...inputStyle, marginTop: '5px' }} /></div>
                <div><div style={microLabel}>Method</div><select value={payMethod} onChange={e => setPayMethod(e.target.value)} style={{ ...inputStyle, marginTop: '5px' }}>{METHODS.map(m => <option key={m}>{m}</option>)}</select></div>
                <div><div style={microLabel}>State</div><select value={payStatus} onChange={e => setPayStatus(e.target.value as 'paid' | 'planned')} style={{ ...inputStyle, marginTop: '5px' }}>
                  <option value="paid">already paid</option><option value="planned">scheduled</option></select></div>
                <div style={{ gridColumn: '1 / -1' }}><div style={microLabel}>{payStatus === 'paid' ? 'Paid on' : 'Due on'}</div>
                  <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} style={{ ...inputStyle, marginTop: '5px', width: '200px' }} /></div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setStep('preview')} disabled={!canPreview}
                style={{ padding: '12px 20px', borderRadius: '10px', background: canPreview ? L.ink : L.line, color: canPreview ? '#fff' : L.inkMuted, fontSize: '14px', fontWeight: 600, border: 'none', cursor: canPreview ? 'pointer' : 'not-allowed', fontFamily: F.sans }}>
                Preview
              </button>
              <button onClick={onClose} style={{ padding: '12px 18px', borderRadius: '10px', background: 'transparent', border: `1px solid ${L.line}`, fontSize: '14px', cursor: 'pointer', fontFamily: F.sans }}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={microLabel}>New invoice — nothing has been created yet</span>
              <span style={{ fontFamily: F.serif, fontSize: '28px' }}>{title}{contractor ? ` · ${contractor}` : ''}</span>
              <span style={{ fontSize: '13px', color: L.inkBody }}>
                {PROPS.find(p => p.id === property)?.name} · {category}
              </span>
            </div>

            <div style={{ background: L.cardAlt, borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '9px', fontSize: '13px' }}>
              <span style={microLabel}>Line items · {validItems.length}</span>
              {validItems.map(l => (
                <div key={l.id} style={{ display: 'flex' }}>
                  <span>{l.description}</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(num(l.amount))}</span>
                </div>
              ))}
              <div style={{ height: '1px', background: L.lineSoft, margin: '3px 0' }} />
              <div style={{ display: 'flex' }}><span style={{ color: L.inkMuted }}>Line items</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(lineTotal)}</span></div>
              {validAdj.map(l => (
                <div key={l.id} style={{ display: 'flex', color: L.amber }}>
                  <span>Held back · {l.description}</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>−{money(num(l.amount))}</span>
                </div>
              ))}
              <div style={{ display: 'flex' }}><span style={{ color: L.inkMuted }}>HST</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{hstAmt ? money(hstAmt) : 'no tax'}</span></div>
              <div style={{ height: '1px', background: L.line, margin: '3px 0' }} />
              <div style={{ display: 'flex', fontSize: '15px', fontWeight: 600 }}>
                <span>Total</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(total)}</span>
              </div>
              <span style={{ fontSize: '11px', color: L.inkFaint, fontFamily: F.mono }}>
                {money(lineTotal)} − {money(heldBack)} + {money(hstAmt)} = {money(total)}
              </span>
            </div>

            {withPayment && (
              <div style={{ background: payStatus === 'planned' ? L.amberWash : 'oklch(0.968 0.03 155)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                <span style={microLabel}>Initial payment</span>
                <span style={{ fontSize: '14px' }}>
                  <strong style={{ fontFamily: F.mono }}>{money(payAmt)}</strong> · {payMethod} · {payStatus === 'paid' ? `paid ${payDate}` : `scheduled for ${payDate} — not counted as paid`}
                </span>
                {payStatus === 'paid' && (
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', lineHeight: 1.5 }}>
                    <input type="checkbox" checked={createExpense} onChange={e => setCreateExpense(e.target.checked)} style={{ marginTop: '3px' }} />
                    <span>Also log as expense (<strong>{money(payAmt)}</strong>, {category}, {contractor || title})
                      <span style={{ display: 'block', color: L.inkMuted, fontSize: '12px' }}>
                        {createExpense ? 'An expense row will be created.' : 'No expense will be created.'}
                      </span></span>
                  </label>
                )}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <span style={microLabel}>Once created</span>
              <div style={{ display: 'flex' }}><span style={{ color: L.inkMuted }}>Total</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(total)}</span></div>
              <div style={{ display: 'flex' }}><span style={{ color: L.inkMuted }}>Paid</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(paidNow)}</span></div>
              <div style={{ display: 'flex', fontWeight: 600 }}><span>Outstanding</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(outstanding)}</span></div>
              {outstanding < -0.005 && <span style={{ color: L.red }}>The payment is {money(Math.abs(outstanding))} more than the invoice total.</span>}
              <span style={{ fontSize: '12px', color: L.inkMuted, marginTop: '4px' }}>
                Writes {1 + validItems.length + validAdj.length + (withPayment ? 1 : 0)} rows across {2 + (validAdj.length ? 1 : 0) + (withPayment ? 1 : 0)} tables as a single unit — if any part fails, none of it is created.
              </span>
            </div>

            {err && <span style={{ fontSize: '13px', color: L.red }}>{err}</span>}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={create} disabled={busy}
                style={{ padding: '12px 20px', borderRadius: '10px', background: L.ink, color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: F.sans, opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Creating…' : 'Create invoice'}
              </button>
              <button onClick={() => setStep('edit')} disabled={busy}
                style={{ padding: '12px 18px', borderRadius: '10px', background: 'transparent', border: `1px solid ${L.line}`, fontSize: '14px', cursor: 'pointer', fontFamily: F.sans }}>Back to edit</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
