'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format, startOfMonth, endOfMonth, startOfYear } from 'date-fns'

const CATEGORIES = [
  'Platform Fees (Airbnb/VRBO)',
  'Cleaning Fees',
  'Utilities',
  'Property Tax',
  'Insurance',
  'Repairs & Maintenance',
  'Furnishings & Supplies',
  'Internet & Cable',
  'Vehicle (KM Method)',
  'Meals',
  'Materials',
  'Labor',
  'Renovation',
  'Bank Fees',
  'Other',
]

const PROPERTIES = [
  { id: '', name: 'All properties / General' },
  { id: 'royal-york-east', name: 'Royal York East' },
  { id: 'royal-york-west', name: 'Royal York West' },
  { id: 'nickel-beach', name: 'Nickel Beach' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

type Expense = {
  id: string
  date: string
  vendor: string | null
  description: string
  amount: number
  hst_paid: number | null
  category: string
  property_id: string | null
  receipt_url: string | null
  receipt_path: string | null
  signed_receipt_url?: string | null
  ai_extracted: boolean
  confirmed: boolean
}

export default function ExpensesManager({ expenses, vendors }: { expenses: Expense[]; vendors: string[] }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const today = new Date().toISOString().split('T')[0]

  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [view, setView] = useState<'list' | 'category' | 'month'>('list')
  const [filterMonth, setFilterMonth] = useState(today.slice(0, 7))
  const [filterCategory, setFilterCategory] = useState('')
  const [filterProperty, setFilterProperty] = useState('')

  const [form, setForm] = useState({
    date: today,
    vendor: '',
    description: '',
    amount: '',
    hst_paid: '',
    category: CATEGORIES[0],
    property_id: '',
    notes: '',
    receipt_url: '',
    receipt_path: null as string | null,
    ai_extracted: false,
    confirmed: false,
  })

  function set(key: string, value: unknown) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleReceiptUpload(file: File) {
    setExtracting(true)
    try {
      const formData = new FormData()
      formData.append('receipt', file)
      const res = await fetch('/api/admin/expenses/extract', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.extracted) {
        setForm(f => ({
          ...f,
          vendor: data.vendor || f.vendor,
          amount: data.amount || f.amount,
          hst_paid: data.hst || f.hst_paid,
          date: data.date || f.date,
          category: data.category || f.category,
          description: data.description || f.description,
          receipt_url: data.receipt_url || f.receipt_url,
          ai_extracted: true,
        }))
      }
    } catch {}
    finally { setExtracting(false) }
  }

  async function handlePastedText(text: string) {
    if (!text.trim()) return
    setExtracting(true)
    try {
      const formData = new FormData()
      formData.append('text', text)
      const res = await fetch('/api/admin/expenses/extract', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.extracted) {
        setForm(f => ({
          ...f,
          vendor: data.vendor || f.vendor,
          amount: data.amount || f.amount,
          hst_paid: data.hst || f.hst_paid,
          date: data.date || f.date,
          category: data.category || f.category,
          description: data.description || f.description,
          receipt_path: data.receipt_path || (f as any).receipt_path || null,
          ai_extracted: true,
        }))
      }
    } catch {}
    finally { setExtracting(false) }
  }

  async function handleSave(force = false) {
    if (!form.description || !form.amount) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount: parseFloat(form.amount) || 0,
          hst_paid: form.hst_paid ? parseFloat(form.hst_paid) : null,
          property_id: form.property_id || null,
          confirmed: true,
          force,
        }),
      })
      if (res.status === 409) {
        const dup = await res.json()
        if (confirm(`⚠ Possible duplicate:\n${dup.message}\n\nAdd anyway?`)) {
          setSaving(false)
          return handleSave(true)
        }
        setSaving(false)
        return
      }
      setForm({ date: today, vendor: '', description: '', amount: '', hst_paid: '', category: CATEGORIES[0], property_id: '', notes: '', receipt_url: '', receipt_path: null, ai_extracted: false, confirmed: false })
      setShowForm(false)
      router.refresh()
    } catch {}
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this expense?')) return
    await fetch(`/api/admin/expenses/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  // filter expenses
  const filtered = expenses.filter(e => {
    if (filterMonth && !e.date.startsWith(filterMonth)) return false
    if (filterCategory && e.category !== filterCategory) return false
    if (filterProperty && e.property_id !== filterProperty) return false
    return true
  })

  const totalAmount = filtered.reduce((s, e) => s + (e.amount || 0), 0)
  const totalHst = filtered.reduce((s, e) => s + (e.hst_paid || 0), 0)

  // category breakdown
  const byCategory = CATEGORIES.map(cat => ({
    cat,
    total: filtered.filter(e => e.category === cat).reduce((s, e) => s + (e.amount || 0), 0),
    count: filtered.filter(e => e.category === cat).length,
  })).filter(c => c.count > 0).sort((a, b) => b.total - a.total)

  return (
    <div>
      {/* summary bar */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: '#363634', marginBottom: '24px' }}>
        {[
          { label: 'Total expenses', value: `$${totalAmount.toFixed(2)}` },
          { label: 'HST / ITC', value: `$${totalHst.toFixed(2)}` },
          { label: 'Net (ex-HST)', value: `$${(totalAmount - totalHst).toFixed(2)}` },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: '#242422', padding: '20px 24px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>{label}</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '24px', fontWeight: 300, color: '#F5F2EC' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="filter-row" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'center' }}>
        <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          style={{ ...inputStyle, width: 'auto', background: '#363634' }} />
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          style={{ ...inputStyle, width: 'auto', background: '#363634' }}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)}
          style={{ ...inputStyle, width: 'auto', background: '#363634' }}>
          {PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '1px', marginLeft: 'auto' }}>
          {(['list', 'category'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '7px 14px', background: view === v ? '#F5F2EC' : '#363634', color: view === v ? '#1A1A18' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* add expense */}
      <div style={{ marginBottom: '24px' }}>
        {!showForm ? (
          <button onClick={() => setShowForm(true)}
            style={{ padding: '10px 20px', background: 'var(--amber)', color: '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 500 }}>
            + Add expense
          </button>
        ) : (
          <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px' }}>
            <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>New expense</div>

            {/* receipt upload + paste */}
            <div style={{ background: '#1E1E1C', border: '0.5px dashed #4A4A48', padding: '16px', textAlign: 'center', marginBottom: '8px', cursor: 'pointer' }}
              onClick={() => fileRef.current?.click()}
              onPaste={e => {
                const text = e.clipboardData.getData('text')
                if (text) { e.preventDefault(); handlePastedText(text) }
              }}
              tabIndex={0}>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                onChange={e => e.target.files?.[0] && handleReceiptUpload(e.target.files[0])} />
              {extracting ? (
                <div style={{ fontSize: '13px', color: 'var(--amber)' }}>AI reading receipt...</div>
              ) : form.ai_extracted ? (
                <div style={{ fontSize: '12px', color: '#2ecc71' }}>✓ Receipt scanned — review fields below</div>
              ) : (
                <div style={{ fontSize: '13px', color: '#9A9A92' }}>📷 Upload image/PDF or click here and paste (Cmd+V) receipt text</div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Date</div>
                <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Vendor</div>
                <input type="text" value={form.vendor} onChange={e => set('vendor', e.target.value)}
                  list="vendors-list" placeholder="e.g. Canadian Tire" style={inputStyle} />
                <datalist id="vendors-list">{vendors.map(v => <option key={v} value={v} />)}</datalist>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Description</div>
                <input type="text" value={form.description} onChange={e => set('description', e.target.value)} placeholder="What was purchased" style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Amount ($)</div>
                <input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" step="0.01" style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>HST paid ($)</div>
                <input type="number" value={form.hst_paid} onChange={e => set('hst_paid', e.target.value)} placeholder="0.00" step="0.01" style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Category</div>
                <select value={form.category} onChange={e => set('category', e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Property</div>
                <select value={form.property_id} onChange={e => set('property_id', e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
                  {PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', background: '#363634', color: '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => handleSave()} disabled={!form.description || !form.amount || saving}
                style={{ padding: '8px 20px', background: form.description && form.amount ? 'var(--amber)' : '#363634', color: form.description && form.amount ? '#1A1A18' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', fontWeight: 500 }}>
                {saving ? 'Saving...' : 'Add expense'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* category view */}
      {view === 'category' && (
        <div style={{ marginBottom: '24px' }}>
          {byCategory.map(({ cat, total, count }) => (
            <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '0.5px solid #363634' }}>
              <div>
                <div style={{ fontSize: '13px', color: '#F5F2EC' }}>{cat}</div>
                <div style={{ fontSize: '11px', color: '#9A9A92' }}>{count} expense{count !== 1 ? 's' : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--serif)', fontSize: '18px', fontWeight: 300, color: '#F5F2EC' }}>${total.toFixed(2)}</div>
                <div style={{ fontSize: '11px', color: '#9A9A92' }}>{((total / totalAmount) * 100).toFixed(0)}%</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* list view */}
      {view === 'list' && (
        <div style={{ background: '#242422', border: '0.5px solid #363634' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 120px 80px 80px 40px', padding: '10px 20px', borderBottom: '0.5px solid #363634', fontSize: '9px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: '#666660' }}>
            <span>Date</span><span>Description</span><span>Category</span><span>Amount</span><span>HST</span><span></span>
          </div>
          {!filtered.length ? (
            <div style={{ padding: '32px 20px', fontSize: '13px', color: '#666660' }}>No expenses for this period.</div>
          ) : filtered.map(e => (
            <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 120px 80px 80px 40px', padding: '12px 20px', borderBottom: '0.5px solid #363634', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: '#AEAEA6' }}>{format(new Date(e.date + 'T12:00:00'), 'MMM d')}</div>
              <div>
                <div style={{ fontSize: '13px', color: '#F5F2EC' }}>{e.description}</div>
                {e.vendor && <div style={{ fontSize: '11px', color: '#9A9A92' }}>{e.vendor}</div>}
                {e.ai_extracted && <span style={{ fontSize: '9px', color: '#9A9A92', letterSpacing: '.08em' }}>AI</span>}
                {e.signed_receipt_url && <a href={e.signed_receipt_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', color: 'var(--amber)', textDecoration: 'none', marginLeft: '8px' }}>📎 Receipt</a>}
              </div>
              <div style={{ fontSize: '11px', color: '#9A9A92' }}>{e.category}</div>
              <div style={{ fontSize: '13px', color: '#F5F2EC' }}>${e.amount?.toFixed(2)}</div>
              <div style={{ fontSize: '12px', color: '#9A9A92' }}>{e.hst_paid ? `$${e.hst_paid.toFixed(2)}` : '—'}</div>
              <button onClick={() => handleDelete(e.id)} style={{ background: 'none', border: 'none', color: '#555550', cursor: 'pointer', fontSize: '14px' }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
