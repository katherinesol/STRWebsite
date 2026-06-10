'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

const PROPERTIES = [
  { id: 'royal-york-east', name: 'Royal York East', address: '4 Cluny Dr, Etobicoke, ON M8V 1K7' },
  { id: 'royal-york-west', name: 'Royal York West', address: '4 Cluny Dr, Etobicoke, ON M8V 1K7' },
  { id: 'nickel-beach',    name: 'Nickel Beach',    address: '3 Nickel Beach Rd, Port Colborne, ON' },
]

const PURPOSES = ['Cleaning', 'Maintenance', 'Restocking', 'Guest issue', 'Inspection', 'Other']

const CRA_RATE_1 = 0.70  // first 5000 km
const CRA_RATE_2 = 0.64  // after 5000 km
const THRESHOLD = 5000

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

function calcReimbursement(km: number, priorKm: number): { amount: number; rate: number; splitNote?: string } {
  const roundTrip = km * 2
  if (priorKm >= THRESHOLD) {
    return { amount: Math.round(roundTrip * CRA_RATE_2 * 100) / 100, rate: CRA_RATE_2 }
  }
  if (priorKm + roundTrip <= THRESHOLD) {
    return { amount: Math.round(roundTrip * CRA_RATE_1 * 100) / 100, rate: CRA_RATE_1 }
  }
  // splits threshold
  const atRate1 = THRESHOLD - priorKm
  const atRate2 = roundTrip - atRate1
  const amount = Math.round((atRate1 * CRA_RATE_1 + atRate2 * CRA_RATE_2) * 100) / 100
  return { amount, rate: CRA_RATE_1, splitNote: `Split rate: ${atRate1}km @$${CRA_RATE_1} + ${atRate2}km @$${CRA_RATE_2}` }
}

export default function TripsManager({ trips, teamMembers, bookings, yearTotals }: {
  trips: any[]; teamMembers: any[]; bookings: any[]; yearTotals: Record<string, { km: number; reimbursement: number }>
}) {
  const router = useRouter()
  const currentUser = teamMembers.find(t => t.is_current_user) || teamMembers[0]
  const today = new Date().toISOString().split('T')[0]

  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    person: currentUser?.name || '',
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

  const priorKmThisYear = yearTotals[form.person]?.km || 0
  const kmNum = parseFloat(form.km) || 0
  const { amount: reimbursement, rate, splitNote } = kmNum > 0
    ? calcReimbursement(kmNum, priorKmThisYear)
    : { amount: 0, rate: CRA_RATE_1 }

  const destinationAddress = PROPERTIES.find(p => p.id === form.property_id)?.address || ''

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
          starting_address: currentUser?.starting_address || '',
          booking_id: form.booking_id || null,
        }),
      })
      setForm(f => ({ ...f, km: '', notes: '', booking_id: '', date: today }))
      setShowForm(false)
      router.refresh()
    } catch {}
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this trip log?')) return
    await fetch(`/api/admin/trips/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  // year stats
  const myStats = yearTotals[currentUser?.name] || { km: 0, reimbursement: 0 }
  const kmRemaining = Math.max(0, THRESHOLD - myStats.km)

  return (
    <div>
      {/* year summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: '#363634', marginBottom: '24px' }}>
        {[
          { label: 'KM this year', value: `${myStats.km.toFixed(0)} km` },
          { label: 'CRA reimbursement', value: `$${myStats.reimbursement.toFixed(2)}` },
          { label: kmRemaining > 0 ? `KM until rate drops to $${CRA_RATE_2}` : 'Rate', value: kmRemaining > 0 ? `${kmRemaining.toFixed(0)} km` : `$${CRA_RATE_2}/km` },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: '#242422', padding: '20px 24px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>{label}</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '24px', fontWeight: 300, color: '#F5F2EC' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* add trip */}
      {!showForm ? (
        <button onClick={() => setShowForm(true)}
          style={{ padding: '10px 20px', background: 'var(--amber)', color: '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 500, marginBottom: '24px' }}>
          + Log trip
        </button>
      ) : (
        <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>New trip</div>
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
              <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Property (destination)</div>
              <select value={form.property_id} onChange={e => set('property_id', e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
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
            </div>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Link to booking (optional)</div>
              <select value={form.booking_id} onChange={e => set('booking_id', e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
                <option value="">None</option>
                {bookings.map(b => {
                  const g = Array.isArray(b.guest_info) ? b.guest_info[0] : b.guest_info
                  return <option key={b.id} value={b.id}>{b.booking_reference} — {g?.name || '?'} ({format(new Date(b.check_in + 'T12:00:00'), 'MMM d')})</option>
                })}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Notes</div>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          {kmNum > 0 && (
            <div style={{ background: '#1E1E1C', border: '0.5px solid #363634', padding: '12px 16px', marginBottom: '12px', fontSize: '13px', color: '#F5F2EC' }}>
              Round trip: {(kmNum * 2).toFixed(1)} km · Rate: ${rate}/km · <strong style={{ color: 'var(--amber)' }}>Reimbursement: ${reimbursement.toFixed(2)}</strong>
              {splitNote && <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '4px' }}>{splitNote}</div>}
            </div>
          )}
          <div style={{ fontSize: '11px', color: '#555550', marginBottom: '12px' }}>
            From: {currentUser?.starting_address || 'Set starting address in team settings'}
            {' → '} {destinationAddress}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', background: '#363634', color: '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleAdd} disabled={!form.km || saving}
              style={{ padding: '8px 20px', background: form.km ? 'var(--amber)' : '#363634', color: form.km ? '#1A1A18' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', fontWeight: 500 }}>
              {saving ? 'Saving...' : 'Log trip'}
            </button>
          </div>
        </div>
      )}

      {/* trips list */}
      <div style={{ background: '#242422', border: '0.5px solid #363634' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 140px 80px 100px 60px', padding: '10px 20px', borderBottom: '0.5px solid #363634', fontSize: '9px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: '#666660' }}>
          <span>Date</span><span>Details</span><span>Property</span><span>KM</span><span>CRA $</span><span></span>
        </div>
        {!trips.length ? (
          <div style={{ padding: '32px 20px', fontSize: '13px', color: '#666660' }}>No trips logged yet.</div>
        ) : trips.map(t => (
          <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 140px 80px 100px 60px', padding: '12px 20px', borderBottom: '0.5px solid #363634', alignItems: 'center' }}>
            <div style={{ fontSize: '12px', color: '#AEAEA6' }}>{format(new Date(t.date + 'T12:00:00'), 'MMM d, yyyy')}</div>
            <div>
              <div style={{ fontSize: '13px', color: '#F5F2EC' }}>{t.purpose}</div>
              {t.notes && <div style={{ fontSize: '11px', color: '#9A9A92' }}>{t.notes}</div>}
              <div style={{ fontSize: '11px', color: '#555550' }}>by {t.person} · @${t.km_rate}/km</div>
            </div>
            <div style={{ fontSize: '12px', color: '#AEAEA6' }}>{t.property_id === 'royal-york-east' ? 'RYE' : t.property_id === 'royal-york-west' ? 'RYW' : 'NB'}</div>
            <div style={{ fontSize: '13px', color: '#F5F2EC' }}>{(t.km * 2).toFixed(1)}</div>
            <div style={{ fontSize: '13px', color: 'var(--amber)' }}>${t.reimbursement_amount?.toFixed(2)}</div>
            <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', color: '#555550', cursor: 'pointer', fontSize: '14px' }}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}
