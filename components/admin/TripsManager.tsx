'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

const PROPERTIES = [
  { id: 'royal-york-east', name: 'Royal York East', address: 'Mimico, Toronto, ON', kmKey: 'km_to_royal_york' },
  { id: 'royal-york-west', name: 'Royal York West', address: 'Mimico, Toronto, ON', kmKey: 'km_to_royal_york' },
  { id: 'nickel-beach',    name: 'Nickel Beach',    address: 'Port Colborne, ON',   kmKey: 'km_to_nickel_beach' },
]

const PURPOSES = ['Cleaning', 'Maintenance', 'Restocking', 'Guest issue', 'Inspection', 'Other']

const CRA_RATE_1 = 0.70
const CRA_RATE_2 = 0.64
const THRESHOLD = 5000

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

function calcReimbursement(km: number, priorKm: number) {
  const roundTrip = km * 2
  if (priorKm >= THRESHOLD) return { amount: Math.round(roundTrip * CRA_RATE_2 * 100) / 100, rate: CRA_RATE_2, note: `$${CRA_RATE_2}/km (over 5,000km threshold)` }
  if (priorKm + roundTrip <= THRESHOLD) return { amount: Math.round(roundTrip * CRA_RATE_1 * 100) / 100, rate: CRA_RATE_1, note: `$${CRA_RATE_1}/km` }
  const atRate1 = THRESHOLD - priorKm
  const atRate2 = roundTrip - atRate1
  const amount = Math.round((atRate1 * CRA_RATE_1 + atRate2 * CRA_RATE_2) * 100) / 100
  return { amount, rate: CRA_RATE_1, note: `Split: ${atRate1}km @$${CRA_RATE_1} + ${atRate2}km @$${CRA_RATE_2}` }
}

export default function TripsManager({ trips, teamMembers, bookings, yearTotals }: {
  trips: any[]; teamMembers: any[]; bookings: any[]; yearTotals: Record<string, { km: number; reimbursement: number }>
}) {
  const router = useRouter()
  const currentUser = teamMembers.find(t => t.is_current_user) || teamMembers[0]
  const today = new Date().toISOString().split('T')[0]

  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [form, setForm] = useState({
    date: today,
    property_id: 'royal-york-east',
    purpose: 'Cleaning',
    km: '',
    notes: '',
    booking_id: '',
  })

  function set(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  // auto-fill km when property changes
  function handlePropertyChange(propertyId: string) {
    const prop = PROPERTIES.find(p => p.id === propertyId)
    const kmKey = prop?.kmKey as 'km_to_royal_york' | 'km_to_nickel_beach'
    const autoKm = kmKey && currentUser?.[kmKey] ? String(currentUser[kmKey]) : ''
    setForm(f => ({ ...f, property_id: propertyId, km: autoKm }))
  }

  const priorKm = yearTotals[currentUser?.name]?.km || 0
  const kmNum = parseFloat(form.km) || 0
  const { amount: reimbursement, rate, note: rateNote } = kmNum > 0
    ? calcReimbursement(kmNum, priorKm)
    : { amount: 0, rate: CRA_RATE_1, note: '' }

  // all bookings (direct + platform) for this property
  const propertyBookings = bookings.filter((b: any) => b.property_id === form.property_id)

  async function handleAdd() {
    if (!form.km || !form.date) return
    setSaving(true)
    try {
      await fetch('/api/admin/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          km: kmNum,
          km_rate: rate,
          reimbursement_amount: reimbursement,
          person: currentUser?.name || 'Admin',
          starting_address: currentUser?.starting_address || '',
          booking_id: form.booking_id || null,
          notes: showNote ? form.notes : null,
        }),
      })
      setSaved(true)
      setForm({ date: today, property_id: 'royal-york-east', purpose: 'Cleaning', km: '', notes: '', booking_id: '' })
      setShowNote(false)
      setTimeout(() => setSaved(false), 3000)
      router.refresh()
    } catch {}
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this trip log?')) return
    await fetch(`/api/admin/trips/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  const myStats = yearTotals[currentUser?.name] || { km: 0, reimbursement: 0 }
  const kmRemaining = Math.max(0, THRESHOLD - myStats.km)

  return (
    <div>
      {/* year summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: '#363634', marginBottom: '24px' }}>
        {[
          { label: 'KM this year', value: `${myStats.km.toFixed(0)} km` },
          { label: 'CRA reimbursement', value: `$${myStats.reimbursement.toFixed(2)}` },
          { label: kmRemaining > 0 ? `KM until rate drops` : 'Current rate', value: kmRemaining > 0 ? `${kmRemaining.toFixed(0)} km left @$${CRA_RATE_1}` : `$${CRA_RATE_2}/km` },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: '#242422', padding: '20px 24px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>{label}</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '22px', fontWeight: 300, color: '#F5F2EC' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* log trip form */}
      <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', marginBottom: '24px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>Log a trip</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Logged by</div>
            <div style={{ fontSize: '13px', color: '#F5F2EC', padding: '8px 10px', background: '#2A2A28', border: '0.5px solid #4A4A48' }}>{currentUser?.name || 'Admin'}</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Date</div>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Property</div>
            <select value={form.property_id} onChange={e => handlePropertyChange(e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
              {PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Purpose</div>
            <select value={form.purpose} onChange={e => set('purpose', e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
              {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>One-way distance (km)</div>
            <input type="number" value={form.km} onChange={e => set('km', e.target.value)} placeholder="0" min="0" step="0.1" style={inputStyle} />
            {!currentUser?.km_to_royal_york && (
              <div style={{ fontSize: '10px', color: '#555550', marginTop: '3px' }}>Set your distances in team settings to auto-fill</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Link to booking (optional)</div>
            <select value={form.booking_id} onChange={e => set('booking_id', e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
              <option value="">None</option>
              {propertyBookings.map((b: any) => (
                <option key={b.id} value={b.id}>{b.booking_reference} — {b.guest_name || '?'} ({format(new Date(b.check_in + 'T12:00:00'), 'MMM d')})</option>
              ))}
            </select>
          </div>
        </div>

        {/* note toggle */}
        <div style={{ marginBottom: '12px' }}>
          <button onClick={() => setShowNote(n => !n)}
            style={{ background: 'none', border: 'none', color: '#9A9A92', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', padding: 0, letterSpacing: '.06em' }}>
            {showNote ? '▾ Hide note' : '▸ Add note'}
          </button>
          {showNote && (
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} placeholder="Optional note..."
              style={{ ...inputStyle, marginTop: '8px', resize: 'vertical' }} />
          )}
        </div>

        {/* reimbursement preview */}
        {kmNum > 0 && (
          <div style={{ background: '#1E1E1C', border: '0.5px solid #363634', padding: '10px 14px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '12px', color: '#9A9A92' }}>
              Round trip: {(kmNum * 2).toFixed(1)} km · {rateNote}
            </div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '20px', fontWeight: 300, color: 'var(--amber)' }}>
              ${reimbursement.toFixed(2)}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={handleAdd} disabled={!form.km || saving}
            style={{ padding: '10px 24px', background: form.km ? 'var(--amber)' : '#363634', color: form.km ? '#1A1A18' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: form.km ? 'pointer' : 'not-allowed', fontWeight: 500 }}>
            {saving ? 'Saving...' : 'Log trip'}
          </button>
          {saved && <span style={{ fontSize: '11px', color: '#2ecc71', letterSpacing: '.1em', textTransform: 'uppercase' }}>✓ Logged</span>}
        </div>
      </div>

      {/* trips list */}
      <div style={{ background: '#242422', border: '0.5px solid #363634' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 120px 70px 90px 40px', padding: '10px 20px', borderBottom: '0.5px solid #363634', fontSize: '9px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: '#666660' }}>
          <span>Date</span><span>Details</span><span>Property</span><span>KM</span><span>CRA $</span><span></span>
        </div>
        {!trips.length ? (
          <div style={{ padding: '32px 20px', fontSize: '13px', color: '#666660' }}>No trips logged yet.</div>
        ) : trips.map(t => (
          <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 120px 70px 90px 40px', padding: '12px 20px', borderBottom: '0.5px solid #363634', alignItems: 'center' }}>
            <div style={{ fontSize: '12px', color: '#AEAEA6' }}>{format(new Date(t.date + 'T12:00:00'), 'MMM d, yyyy')}</div>
            <div>
              <div style={{ fontSize: '13px', color: '#F5F2EC' }}>{t.purpose}</div>
              {t.notes && <div style={{ fontSize: '11px', color: '#9A9A92' }}>{t.notes}</div>}
              <div style={{ fontSize: '11px', color: '#555550' }}>by {t.person}</div>
            </div>
            <div style={{ fontSize: '12px', color: '#AEAEA6' }}>
              {t.property_id === 'royal-york-east' ? 'Royal York East' : t.property_id === 'royal-york-west' ? 'Royal York West' : 'Nickel Beach'}
            </div>
            <div style={{ fontSize: '13px', color: '#F5F2EC' }}>{(t.km * 2).toFixed(1)}</div>
            <div style={{ fontSize: '13px', color: 'var(--amber)' }}>${t.reimbursement_amount?.toFixed(2)}</div>
            <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', color: '#555550', cursor: 'pointer', fontSize: '14px' }}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}
