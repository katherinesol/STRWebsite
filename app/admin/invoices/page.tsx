'use client'
import { useState, useEffect, useRef } from 'react'
import { EXPENSE_CATEGORIES } from '@/lib/expense-categories'

const PROPERTIES = [
  { id: 'royal-york', name: 'Royal York (both)' },
  { id: 'royal-york-east', name: 'Royal York East' },
  { id: 'royal-york-west', name: 'Royal York West' },
  { id: 'nickel-beach', name: 'Nickel Beach' },
]
const propName = (id: string) => PROPERTIES.find(p => p.id === id)?.name || 'No property'
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '13px', boxSizing: 'border-box', outline: 'none', borderRadius: '3px' }

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<any | null>(null) // invoice being created/edited

  function load() {
    fetch('/api/admin/invoices').then(r => r.json()).then(d => { if (d.error) setError(d.error); else setInvoices(d.invoices || []) }).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const openId = params.get('open')
    if (openId) {
      openEdit(openId)
      // clean the URL so refbutton doesn't re-open
      window.history.replaceState({}, '', '/admin/invoices')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openEdit(id: string | null) {
    if (id === null) {
      setEditing({ contractor_name: '', company: '', contractor_contact: '', property_id: '', title: '', category: 'Repairs & maintenance', due_date: 'completion', items: [], adjustments: [], payments: [] })
      return
    }
    const d = await fetch(`/api/admin/invoices/${id}`).then(r => r.json())
    setEditing({
      id,
      contractor_name: d.invoice.contractor_name || '',
      company: d.invoice.company || '',
      contractor_contact: d.invoice.contractor_contact || '',
      property_id: d.invoice.property_id || '',
      title: d.invoice.title || '',
      share_token: d.invoice.share_token,
      acknowledged_at: d.invoice.acknowledged_at,
      category: d.invoice.category || 'Repairs & maintenance',
      due_date: d.invoice.due_date || 'completion',
      tax_mode: d.invoice.tax_mode || 'auto',
      hst_amount: d.invoice.hst_amount ?? '',
      items: d.items || [],
      adjustments: d.adjustments || [],
      payments: d.payments || [],
    })
  }

  async function saveAll(override?: any) {
    setError('')
    const payload = override || editing
    const res = await fetch('/api/admin/invoices/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const d = await res.json()
    if (d.error) { setError(d.error); return }
    setEditing(null); load()
  }

  async function deleteInvoice(id: string) {
    if (!window.confirm('Delete this invoice?')) return
    await fetch(`/api/admin/invoices/${id}`, { method: 'DELETE' })
    setEditing(null); load()
  }

  if (loading) return <div style={{ color: '#9A9A92' }}>Loading…</div>

  if (editing) return <InvoiceEditor editing={editing} setEditing={setEditing} saveAll={saveAll} error={error} onCancel={() => { setEditing(null); setError('') }} onDelete={deleteInvoice} />

  return (
    <div style={{ maxWidth: '820px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '28px', color: '#F0EDE6' }}>Invoices</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <a href="/api/admin/invoices/export" style={{ padding: '10px 16px', background: '#363634', color: '#AEAEA6', textDecoration: 'none', fontSize: '11px', fontWeight: 600, borderRadius: '3px' }}>↓ Export CSV</a>
          <button onClick={() => openEdit(null)} style={{ padding: '10px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '3px' }}>+ New invoice</button>
        </div>
      </div>
      {error && <div style={{ color: '#e74c3c', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}

      <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '3px' }}>
        {!invoices.length ? <div style={{ padding: '24px', color: '#666660', fontSize: '13px' }}>No invoices yet.</div> :
          invoices.map(inv => (
            <div key={inv.id} onClick={() => openEdit(inv.id)} style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid #2A2A28' }}>
              <div>
                <div style={{ fontSize: '14px', color: '#F0EDE6' }}>{inv.title} <span style={{ color: '#9A9A92', fontSize: '12px' }}>· {inv.company || inv.contractor_name}</span></div>
                <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>{propName(inv.property_id)}{inv.acknowledged_at && ' · ✓ acknowledged'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '15px', color: inv.outstanding > 0 ? '#e67e22' : '#2ecc71' }}>${inv.outstanding.toFixed(2)}</div>
                <div style={{ fontSize: '10px', color: '#666660' }}>of ${inv.total.toFixed(2)}</div>
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

function InvoiceEditor({ editing, setEditing, saveAll, error, onCancel, onDelete }: any) {
  const e = editing
  const set = (patch: any) => setEditing((prev: any) => ({ ...prev, ...patch }))
  const [itemDesc, setItemDesc] = useState(''); const [itemAmt, setItemAmt] = useState('')
  const [adjDesc, setAdjDesc] = useState(''); const [adjAmt, setAdjAmt] = useState('')
  const [payAmt, setPayAmt] = useState(''); const [payStatus, setPayStatus] = useState('paid'); const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const [payDue, setPayDue] = useState('completion')
  const [editPayIdx, setEditPayIdx] = useState<number | null>(null)
  const [payMethod, setPayMethod] = useState('etransfer'); const [payDetail, setPayDetail] = useState(''); const [payLast4, setPayLast4] = useState('')
  const [vendors, setVendors] = useState<any[]>([]); const [savedMethods, setSavedMethods] = useState<any[]>([])
  const [showVendorList, setShowVendorList] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState<any>(null)
  const [extractError, setExtractError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const itemTotal = e.items.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0)
  const adjTotal = e.adjustments.reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0)
  const paidTotal = e.payments.filter((p: any) => p.status === 'paid').reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
  const taxMode = e.tax_mode || 'auto'
  const hst = taxMode === 'none' ? 0 : taxMode === 'manual' ? (Number(e.hst_amount) || 0) : (itemTotal - adjTotal) * 0.13
  const total = itemTotal - adjTotal + hst
  // keep editing.hst_amount in sync with auto mode; clear it when 'none'
  useEffect(() => {
    if (taxMode === 'auto') {
      const computed = Number(((itemTotal - adjTotal) * 0.13).toFixed(2))
      setEditing((prev: any) => prev.hst_amount === computed ? prev : { ...prev, hst_amount: computed })
    } else if (taxMode === 'none') {
      setEditing((prev: any) => prev.hst_amount === 0 ? prev : { ...prev, hst_amount: 0 })
    }
  }, [itemTotal, adjTotal, taxMode])
  const shareUrl = typeof window !== 'undefined' && e.share_token ? `${window.location.origin}/invoice/${e.share_token}` : ''

  const lbl: React.CSSProperties = { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.1em', margin: '16px 0 8px' }

  useEffect(() => {
    fetch('/api/admin/invoices/vendors').then(r => r.json()).then(d => { setVendors(d.contractors || []); setSavedMethods(d.methods || []) })
  }, [])

  const vendorMatches = e.contractor_name.length >= 1
    ? vendors.filter((v: any) => v.contractor_name.toLowerCase().includes(e.contractor_name.toLowerCase()) && v.contractor_name.toLowerCase() !== e.contractor_name.toLowerCase()).slice(0, 6)
    : []

  function markPaymentPaid(i: number) {
    const today = new Date().toISOString().split('T')[0]
    setEditing((prev: any) => ({ ...prev, payments: prev.payments.map((p: any, x: number) => x === i ? { ...p, status: 'paid', paid_at: today, due_date: null } : p) }))
  }
  function updatePayment(i: number, patch: any) {
    setEditing((prev: any) => ({ ...prev, payments: prev.payments.map((p: any, x: number) => x === i ? { ...p, ...patch } : p) }))
  }

  function pickVendor(v: any) {
    setEditing((prev: any) => ({ ...prev, contractor_name: v.contractor_name, company: v.company || prev.company, contractor_contact: v.contractor_contact || prev.contractor_contact }))
    setShowVendorList(false)
  }

  async function handleReceipt(file: File) {
    setExtracting(true); setExtractError(''); setExtracted(null)
    try {
      const fd = new FormData()
      fd.append('receipt', file)
      const res = await fetch('/api/admin/invoices/extract', { method: 'POST', body: fd })
      const d = await res.json()
      if (d.error) { setExtractError(d.error); return }
      setExtracted({ ...d.extracted, receipt_path: d.receipt_path })
    } catch (err: any) {
      setExtractError('Upload failed')
    } finally {
      setExtracting(false)
    }
  }

  function applyExtracted() {
    if (!extracted) return
    setEditing((prev: any) => ({
      ...prev,
      contractor_name: extracted.contractor_name || prev.contractor_name,
      company: extracted.company || prev.company,
      category: extracted.category || prev.category,
      title: prev.title || (extracted.items?.[0]?.description ? `${extracted.contractor_name || 'Invoice'} work` : prev.title),
      items: [...prev.items, ...(extracted.items || []).map((it: any) => ({ description: it.description, amount: it.amount }))],
      hst_amount: extracted.hst != null ? extracted.hst : prev.hst_amount,
      tax_mode: extracted.hst != null ? 'manual' : prev.tax_mode,
    }))
    setExtracted(null)
  }

  function flushAndSave() {
    // fold any filled-in input fields into the arrays before saving, so nothing typed is lost
    let next = { ...editing }
    if (itemDesc && itemAmt) next = { ...next, items: [...next.items, { description: itemDesc, amount: itemAmt }] }
    if (adjDesc && adjAmt) next = { ...next, adjustments: [...next.adjustments, { description: adjDesc, amount: adjAmt }] }
    if (payAmt) next = { ...next, payments: [...next.payments, { amount: payAmt, status: payStatus, paid_at: payStatus === 'paid' ? payDate : null, due_date: payStatus === 'planned' ? payDue : null, method: payMethod, method_detail: (payMethod === 'credit' || payMethod === 'debit' || payMethod === 'etransfer' || payMethod === 'billpay') ? payDetail : null, method_last4: (payMethod === 'credit' || payMethod === 'debit' || payMethod === 'etransfer' || payMethod === 'billpay') ? payLast4 : null }] }
    setEditing(next)
    // clear the inputs
    setItemDesc(''); setItemAmt(''); setAdjDesc(''); setAdjAmt(''); setPayAmt(''); setPayDetail(''); setPayLast4('')
    // save with the folded object directly (don't rely on async state)
    saveAll(next)
  }

  return (
    <div style={{ maxWidth: '720px' }}>
      <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#9A9A92', cursor: 'pointer', fontSize: '13px', marginBottom: '14px' }}>← Back</button>
      <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '26px', color: '#F0EDE6', marginBottom: '18px' }}>{e.id ? 'Edit invoice' : 'New invoice'}</h1>
      {error && <div style={{ color: '#e74c3c', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}

      {/* header fields */}
      <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '18px', borderRadius: '3px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <div style={{ position: 'relative' }}>
          <input placeholder="Contractor name" value={e.contractor_name} onChange={ev => {
          const val = ev.target.value
          const match = vendors.find((v: any) => v.contractor_name && v.contractor_name.toLowerCase() === val.toLowerCase())
          if (match && !e.company) set({ contractor_name: val, company: match.company || '', contractor_contact: e.contractor_contact || match.contractor_contact || '' })
          else set({ contractor_name: val })
          setShowVendorList(true)
        }} onFocus={() => setShowVendorList(true)} style={{ ...inp, width: '100%' }} />
          {showVendorList && vendorMatches.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#2A2A28', border: '0.5px solid #4A4A48', borderRadius: '3px', marginTop: '2px', maxHeight: '200px', overflowY: 'auto' }}>
              {vendorMatches.map((v: any, i: number) => (
                <div key={i} onClick={() => pickVendor(v)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: '#F0EDE6', borderBottom: '0.5px solid #363634' }}>
                  {v.contractor_name}{v.company ? <span style={{ color: '#9A9A92' }}> · {v.company}</span> : ''}
                </div>
              ))}
            </div>
          )}
        </div>
        <input placeholder="Company (optional)" value={e.company} onChange={ev => {
          const val = ev.target.value
          const match = vendors.find((v: any) => v.company && v.company.toLowerCase() === val.toLowerCase())
          if (match && !e.contractor_name) set({ company: val, contractor_name: match.contractor_name, contractor_contact: e.contractor_contact || match.contractor_contact || '' })
          else set({ company: val })
        }} style={inp} />
        <input placeholder="Title (e.g. Kitchen reno)" value={e.title} onChange={ev => set({ title: ev.target.value })} style={inp} />
        <select value={e.property_id} onChange={ev => set({ property_id: ev.target.value })} style={inp}>
          <option value="">No property</option>{PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={e.category || 'Repairs & maintenance'} onChange={ev => set({ category: ev.target.value })} style={{ ...inp, gridColumn: '1 / -1' }}>
          {EXPENSE_CATEGORIES.map((c: string) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input placeholder="Contact (phone/email)" value={e.contractor_contact} onChange={ev => set({ contractor_contact: ev.target.value })} style={{ ...inp, gridColumn: '1 / -1' }} />
      </div>

      {/* receipt attach + AI extract */}
      <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '16px 18px', borderRadius: '3px', marginBottom: '16px' }}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
          onChange={ev => { const f = ev.target.files?.[0]; if (f) handleReceipt(f) }} />
        {extracting ? (
          <div style={{ fontSize: '13px', color: 'var(--amber)' }}>Reading receipt…</div>
        ) : extracted ? (
          <div>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--amber)', marginBottom: '10px' }}>Review extracted — nothing fills until you apply</div>
            <div style={{ fontSize: '13px', color: '#F0EDE6', lineHeight: 1.7 }}>
              {extracted.contractor_name && <div>Contractor: <span style={{ color: '#9A9A92' }}>{extracted.contractor_name}</span></div>}
              {extracted.company && <div>Company: <span style={{ color: '#9A9A92' }}>{extracted.company}</span></div>}
              {extracted.date && <div>Date: <span style={{ color: '#9A9A92' }}>{extracted.date}</span></div>}
              {extracted.category && <div>Category: <span style={{ color: '#9A9A92' }}>{extracted.category}</span></div>}
              {(extracted.items || []).length > 0 && <div>Items: <span style={{ color: '#9A9A92' }}>{extracted.items.length} line(s) — ${(extracted.items).reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0).toFixed(2)}</span></div>}
              {extracted.hst != null && <div>HST: <span style={{ color: '#9A9A92' }}>${Number(extracted.hst).toFixed(2)}</span></div>}
              {extracted.total != null && <div>Total: <span style={{ color: '#9A9A92' }}>${Number(extracted.total).toFixed(2)}</span></div>}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button onClick={applyExtracted} style={{ padding: '8px 16px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '3px' }}>Apply to form</button>
              <button onClick={() => setExtracted(null)} style={{ padding: '8px 14px', background: '#363634', color: '#9A9A92', border: 'none', fontSize: '11px', cursor: 'pointer', borderRadius: '3px' }}>Discard</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '13px', color: '#9A9A92' }}>Attach a receipt or invoice — AI will pull the details</div>
            <button onClick={() => fileRef.current?.click()} style={{ padding: '8px 16px', background: '#363634', color: '#AEAEA6', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '3px' }}>📎 Attach receipt</button>
          </div>
        )}
        {extractError && <div style={{ fontSize: '12px', color: '#e74c3c', marginTop: '8px' }}>{extractError}</div>}
      </div>

      {/* line items */}
      <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '18px', borderRadius: '3px', marginBottom: '16px' }}>
        <div style={{ ...lbl, color: '#B8956B', marginTop: 0 }}>Line items</div>
        {e.items.map((it: any, i: number) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px', color: '#F0EDE6' }}>
            <span>{it.description}</span><span>${Number(it.amount).toFixed(2)} <button onClick={() => setEditing((prev: any) => ({ ...prev, items: prev.items.filter((_: any, x: number) => x !== i) }))} style={{ background: 'none', border: 'none', color: '#666660', cursor: 'pointer' }}>✕</button></span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <input placeholder="Item" value={itemDesc} onChange={ev => setItemDesc(ev.target.value)} style={{ ...inp, flex: 1 }} />
          <input placeholder="$" type="number" value={itemAmt} onChange={ev => setItemAmt(ev.target.value)} style={{ ...inp, width: '90px' }} />
          <button onClick={() => { if (itemDesc && itemAmt) { setEditing((prev: any) => ({ ...prev, items: [...prev.items, { description: itemDesc, amount: itemAmt }] })); setItemDesc(''); setItemAmt('') } }} style={{ padding: '0 14px', background: '#363634', color: '#AEAEA6', border: 'none', cursor: 'pointer', borderRadius: '3px', fontSize: '12px' }}>Add</button>
        </div>

        <div style={{ ...lbl, color: '#e67e22' }}>Deductions</div>
        {e.adjustments.map((a: any, i: number) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px', color: '#e67e22' }}>
            <span>{a.description}</span><span>−${Number(a.amount).toFixed(2)} <button onClick={() => setEditing((prev: any) => ({ ...prev, adjustments: prev.adjustments.filter((_: any, x: number) => x !== i) }))} style={{ background: 'none', border: 'none', color: '#666660', cursor: 'pointer' }}>✕</button></span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <input placeholder="Reason for deduction" value={adjDesc} onChange={ev => setAdjDesc(ev.target.value)} style={{ ...inp, flex: 1 }} />
          <input placeholder="$" type="number" value={adjAmt} onChange={ev => setAdjAmt(ev.target.value)} style={{ ...inp, width: '90px' }} />
          <button onClick={() => { if (adjDesc && adjAmt) { setEditing((prev: any) => ({ ...prev, adjustments: [...prev.adjustments, { description: adjDesc, amount: adjAmt }] })); setAdjDesc(''); setAdjAmt('') } }} style={{ padding: '0 14px', background: '#363634', color: '#AEAEA6', border: 'none', cursor: 'pointer', borderRadius: '3px', fontSize: '12px' }}>Deduct</button>
        </div>

        <div style={{ ...lbl, color: '#2ecc71' }}>Payments</div>
        {e.payments.map((p: any, i: number) => (
          <div key={i} style={{ padding: '4px 0', fontSize: '13px', color: '#F0EDE6' }}>
            {editPayIdx === i ? (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', padding: '6px 0' }}>
                <input type="number" value={p.amount} onChange={ev => updatePayment(i, { amount: ev.target.value })} placeholder="Amount" style={{ ...inp, width: '90px' }} />
                <select value={p.method || ''} onChange={ev => updatePayment(i, { method: ev.target.value })} style={{ ...inp, width: 'auto' }}>
                  <option value="etransfer">E-transfer</option>
                  <option value="billpay">Bill payment</option>
                  <option value="credit">Credit card</option>
                  <option value="debit">Debit card</option>
                  <option value="cash">Cash</option>
                </select>
                {p.status === 'paid'
                  ? <input type="date" value={p.paid_at || ''} onChange={ev => updatePayment(i, { paid_at: ev.target.value })} title="Paid on" style={{ ...inp, width: 'auto' }} />
                  : <input type="date" value={p.due_date && p.due_date !== 'completion' ? p.due_date : ''} onChange={ev => updatePayment(i, { due_date: ev.target.value || 'completion' })} title="Due date (blank = on completion)" style={{ ...inp, width: 'auto' }} />}
                <button onClick={() => setEditPayIdx(null)} style={{ padding: '5px 12px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '3px' }}>Done</button>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>${Number(p.amount).toFixed(2)}{p.method ? ` · ${p.method}${p.method_detail ? ' ' + p.method_detail : ''}${p.method_last4 ? ' …' + p.method_last4 : ''}` : ''} {p.status === 'paid' ? <span style={{ color: '#2ecc71' }}>· paid {p.paid_at || ''}</span> : <span style={{ color: '#e6a54b' }}>· planned{p.due_date && p.due_date !== 'completion' ? ` · due ${p.due_date}` : ' · due on completion'}</span>}</span>
                <span style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {p.status === 'planned' && <button onClick={() => markPaymentPaid(i)} style={{ padding: '3px 10px', background: '#1f2a1a', color: '#2ecc71', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', borderRadius: '3px' }}>Paid</button>}
                  <button onClick={() => setEditPayIdx(i)} style={{ background: 'none', border: 'none', color: '#9A9A92', cursor: 'pointer', fontSize: '11px' }}>Edit</button>
                  <button onClick={() => { if (p.status === 'paid' && p.id && !window.confirm('Delete this payment? This will also delete the corresponding expense in your books.')) return; setEditing((prev: any) => ({ ...prev, payments: prev.payments.filter((_: any, x: number) => x !== i) })) }} style={{ background: 'none', border: 'none', color: '#666660', cursor: 'pointer' }}>✕</button>
                </span>
              </div>
            )}
          </div>
        ))}
        <div style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <input placeholder="Amount" type="number" value={payAmt} onChange={ev => setPayAmt(ev.target.value)} style={{ ...inp, flex: 1, minWidth: '90px' }} />
            <select value={payMethod} onChange={ev => setPayMethod(ev.target.value)} style={{ ...inp, width: 'auto' }}>
              <option value="etransfer">E-transfer</option>
              <option value="billpay">Bill payment</option>
              <option value="credit">Credit card</option>
              <option value="debit">Debit card</option>
              <option value="cash">Cash</option>
            </select>
            <select value={payStatus} onChange={ev => setPayStatus(ev.target.value)} style={{ ...inp, width: 'auto' }}>
              <option value="paid">Paid</option>
              <option value="planned">Planned</option>
            </select>
            {payStatus === 'paid' && <input type="date" value={payDate} onChange={ev => setPayDate(ev.target.value)} title="Paid on" style={{ ...inp, width: 'auto' }} />}
            {payStatus === 'planned' && (
              <>
                <select value={payDue === 'completion' ? 'completion' : 'date'} onChange={ev => setPayDue(ev.target.value === 'completion' ? 'completion' : new Date().toISOString().split('T')[0])} style={{ ...inp, width: 'auto' }}>
                  <option value="completion">Due on completion</option>
                  <option value="date">Due by date</option>
                </select>
                {payDue !== 'completion' && <input type="date" value={payDue} onChange={ev => setPayDue(ev.target.value)} style={{ ...inp, width: 'auto' }} />}
              </>
            )}
          </div>
          {(payMethod === 'credit' || payMethod === 'debit' || payMethod === 'etransfer' || payMethod === 'billpay') && (
            <>
              {savedMethods.filter((m: any) => (m.method === payMethod || ((payMethod === 'etransfer' || payMethod === 'billpay') && (m.method === 'etransfer' || m.method === 'billpay'))) && (m.method_detail || m.method_last4)).length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  {savedMethods.filter((m: any) => (m.method === payMethod || ((payMethod === 'etransfer' || payMethod === 'billpay') && (m.method === 'etransfer' || m.method === 'billpay'))) && (m.method_detail || m.method_last4)).map((m: any, i: number) => (
                    <button key={i} onClick={() => { setPayDetail(m.method_detail || ''); setPayLast4(m.method_last4 || '') }} style={{ padding: '5px 10px', background: '#2A2A28', border: '0.5px solid #4A4A48', color: '#AEAEA6', cursor: 'pointer', borderRadius: '3px', fontSize: '11px' }}>
                      {m.method_detail}{m.method_last4 ? ' …' + m.method_last4 : ''}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <input placeholder={payMethod === 'etransfer' ? 'Bank (e.g. PC Financial)' : 'Card (e.g. Amex, BMO)'} value={payDetail} onChange={ev => setPayDetail(ev.target.value)} style={{ ...inp, flex: 1 }} />
                <input placeholder="Last 4" value={payLast4} onChange={ev => setPayLast4(ev.target.value.replace(/\D/g, '').slice(0, 4))} style={{ ...inp, width: '90px' }} />
              </div>
            </>
          )}
          <button onClick={() => { if (payAmt) { setEditing((prev: any) => ({ ...prev, payments: [...prev.payments, { amount: payAmt, status: payStatus, paid_at: payStatus === 'paid' ? payDate : null, due_date: payStatus === 'planned' ? payDue : null, method: payMethod, method_detail: (payMethod === 'credit' || payMethod === 'debit' || payMethod === 'etransfer' || payMethod === 'billpay') ? payDetail : null, method_last4: (payMethod === 'credit' || payMethod === 'debit' || payMethod === 'etransfer' || payMethod === 'billpay') ? payLast4 : null }] })); setPayAmt(''); setPayDetail(''); setPayLast4(''); setPayDue('completion') } }} style={{ padding: '8px 16px', background: '#363634', color: '#AEAEA6', border: 'none', cursor: 'pointer', borderRadius: '3px', fontSize: '12px' }}>Add payment</button>
        </div>

        {/* tax control */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '14px' }}>
          <span style={{ fontSize: '11px', color: '#9A9A92' }}>Tax</span>
          <select value={taxMode} onChange={ev => set({ tax_mode: ev.target.value })} style={{ ...inp, width: 'auto' }}>
            <option value="auto">HST 13% (auto)</option>
            <option value="manual">Manual amount</option>
            <option value="none">No tax</option>
          </select>
          {taxMode === 'manual' && <input placeholder="HST $" type="number" value={e.hst_amount || ''} onChange={ev => set({ hst_amount: ev.target.value })} style={{ ...inp, width: '110px' }} />}
        </div>

        {/* totals */}
        <div style={{ borderTop: '0.5px solid #363634', marginTop: '14px', paddingTop: '12px', fontSize: '13px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9A9A92' }}><span>Subtotal</span><span>${(itemTotal - adjTotal).toFixed(2)}</span></div>
          {hst > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9A9A92' }}><span>HST</span><span>${hst.toFixed(2)}</span></div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9A9A92' }}><span>Total</span><span>${total.toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9A9A92' }}><span>Paid</span><span>${paidTotal.toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 600, color: '#F0EDE6', marginTop: '4px' }}><span>Outstanding</span><span>${(total - paidTotal).toFixed(2)}</span></div>
        </div>
      </div>

      {/* contractor link (existing invoices only) */}
      {shareUrl && (
        <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '14px 18px', borderRadius: '3px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.1em', color: '#9A9A92', marginBottom: '6px' }}>Contractor link {e.acknowledged_at && <span style={{ color: '#2ecc71' }}>· acknowledged</span>}</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input readOnly value={shareUrl} style={{ ...inp, flex: 1, color: '#9A9A92' }} onClick={ev => (ev.target as HTMLInputElement).select()} />
            <button onClick={() => navigator.clipboard.writeText(shareUrl)} style={{ padding: '0 14px', background: '#363634', color: '#AEAEA6', border: 'none', cursor: 'pointer', borderRadius: '3px', fontSize: '12px' }}>Copy</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={flushAndSave} disabled={(!e.contractor_name && !e.company) || !e.title} style={{ padding: '12px 28px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '12px', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: '3px' }}>Save invoice</button>
        <button onClick={onCancel} style={{ padding: '12px 20px', background: '#363634', color: '#9A9A92', border: 'none', fontSize: '12px', cursor: 'pointer', borderRadius: '3px' }}>Cancel</button>
        {e.id && <button onClick={() => onDelete(e.id)} style={{ padding: '12px 20px', background: 'none', color: '#e74c3c', border: '0.5px solid #3a2020', fontSize: '12px', cursor: 'pointer', borderRadius: '3px', marginLeft: 'auto' }}>Delete</button>}
      </div>
    </div>
  )
}
