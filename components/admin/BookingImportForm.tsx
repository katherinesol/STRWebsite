'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

const PROPERTIES = [
  { id: 'royal-york-east', name: 'Royal York East' },
  { id: 'royal-york-west', name: 'Royal York West' },
  { id: 'nickel-beach',    name: 'Nickel Beach' },
]

const PLATFORMS = ['airbnb', 'vrbo', 'houfy', 'direct', 'other']

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

type BookingRow = {
  property_id: string
  platform: string
  check_in: string
  check_out: string
  guest_name: string
  amount_paid: string
  nights: number
}

function emptyRow(): BookingRow {
  return { property_id: 'nickel-beach', platform: 'airbnb', check_in: '', check_out: '', guest_name: '', amount_paid: '', nights: 0 }
}

export default function BookingImportForm() {
  const router = useRouter()
  const [rows, setRows] = useState<BookingRow[]>([emptyRow()])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(0)
  const [errors, setErrors] = useState<string[]>([])

  function updateRow(i: number, key: keyof BookingRow, value: string) {
    setRows(rs => rs.map((r, idx) => {
      if (idx !== i) return r
      const updated = { ...r, [key]: value }
      if (key === 'check_in' || key === 'check_out') {
        const ci = key === 'check_in' ? value : r.check_in
        const co = key === 'check_out' ? value : r.check_out
        if (ci && co) {
          updated.nights = Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000)
        }
      }
      return updated
    }))
  }

  function addRow() {
    setRows(rs => [...rs, { ...emptyRow(), property_id: rs[rs.length-1]?.property_id || 'nickel-beach' }])
  }

  function removeRow(i: number) {
    setRows(rs => rs.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    const valid = rows.filter(r => r.check_in && r.check_out && r.property_id)
    if (!valid.length) return
    setSaving(true)
    setErrors([])
    let count = 0
    const errs: string[] = []

    for (const row of valid) {
      try {
        const res = await fetch('/api/admin/bookings/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(row),
        })
        const data = await res.json()
        if (res.ok) count++
        else errs.push(`${row.check_in}: ${data.error}`)
      } catch {
        errs.push(`${row.check_in}: network error`)
      }
    }

    setSaved(count)
    setErrors(errs)
    setSaving(false)
    if (!errs.length) {
      setRows([emptyRow()])
      router.refresh()
    }
  }

  const totalRevenue = rows.reduce((s, r) => s + (parseFloat(r.amount_paid) || 0), 0)

  return (
    <div>
      {/* table */}
      <div style={{ background: '#242422', border: '0.5px solid #363634', marginBottom: '16px', overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 90px 110px 110px 1fr 100px 40px', padding: '8px 16px', borderBottom: '0.5px solid #363634', fontSize: '9px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: '#666660', minWidth: '700px' }}>
          <span>Property</span><span>Platform</span><span>Check-in</span><span>Check-out</span><span>Guest name</span><span>Amount paid</span><span></span>
        </div>
        {rows.map((row, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 90px 110px 110px 1fr 100px 40px', padding: '8px 16px', borderBottom: '0.5px solid #363634', alignItems: 'center', gap: '6px', minWidth: '700px' }}>
            <select value={row.property_id} onChange={e => updateRow(i, 'property_id', e.target.value)} style={{ ...inputStyle, fontSize: '12px' }}>
              {PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={row.platform} onChange={e => updateRow(i, 'platform', e.target.value)} style={{ ...inputStyle, fontSize: '12px' }}>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input type="date" value={row.check_in} onChange={e => updateRow(i, 'check_in', e.target.value)} style={{ ...inputStyle, fontSize: '12px' }} />
            <input type="date" value={row.check_out} onChange={e => updateRow(i, 'check_out', e.target.value)} min={row.check_in} style={{ ...inputStyle, fontSize: '12px' }} />
            <input type="text" value={row.guest_name} onChange={e => updateRow(i, 'guest_name', e.target.value)} placeholder="Optional" style={{ ...inputStyle, fontSize: '12px' }} />
            <input type="number" value={row.amount_paid} onChange={e => updateRow(i, 'amount_paid', e.target.value)} placeholder="0.00" style={{ ...inputStyle, fontSize: '12px' }} />
            <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: '#555550', cursor: 'pointer', fontSize: '16px', padding: 0 }}>×</button>
          </div>
        ))}
      </div>

      {/* summary */}
      {rows.some(r => r.amount_paid) && (
        <div style={{ fontSize: '13px', color: '#9A9A92', marginBottom: '12px' }}>
          {rows.filter(r => r.check_in && r.check_out).length} bookings · Total: <strong style={{ color: '#F5F2EC' }}>${totalRevenue.toFixed(2)}</strong>
        </div>
      )}

      {/* actions */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
        <button onClick={addRow}
          style={{ padding: '8px 16px', background: 'transparent', border: '0.5px solid #363634', color: '#9A9A92', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', letterSpacing: '.08em' }}>
          + Add row
        </button>
        <button onClick={handleSave} disabled={saving || !rows.some(r => r.check_in && r.check_out)}
          style={{ padding: '8px 20px', background: rows.some(r => r.check_in) ? 'var(--amber)' : '#363634', color: rows.some(r => r.check_in) ? '#1A1A18' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase' }}>
          {saving ? 'Saving...' : `Import ${rows.filter(r => r.check_in && r.check_out).length} booking${rows.filter(r => r.check_in && r.check_out).length !== 1 ? 's' : ''}`}
        </button>
        {saved > 0 && <span style={{ fontSize: '11px', color: '#2ecc71' }}>✓ {saved} imported</span>}
      </div>

      {errors.length > 0 && (
        <div style={{ background: '#1f0a0a', border: '0.5px solid #3a1a1a', padding: '12px 16px' }}>
          {errors.map((e, i) => <div key={i} style={{ fontSize: '12px', color: '#e74c3c' }}>{e}</div>)}
        </div>
      )}
    </div>
  )
}
