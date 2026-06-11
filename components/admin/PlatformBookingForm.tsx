'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', marginBottom: '16px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>{label}</div>
      {children}
    </div>
  )
}

function ApprovalButtons({ value, onChange }: { value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      {([{ val: true, label: 'Granted', color: '#2ecc71' }, { val: false, label: 'Denied', color: '#e74c3c' }, { val: null, label: 'N/A', color: '#888880' }] as const).map(({ val, label, color }) => (
        <button key={label} onClick={() => onChange(val)}
          style={{ padding: '6px 14px', background: value === val ? color : '#363634', color: value === val ? '#fff' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', letterSpacing: '.08em' }}>
          {label}
        </button>
      ))}
    </div>
  )
}

function GuestAutocomplete({ value, onChange, onSelect }: {
  value: string
  onChange: (v: string) => void
  onSelect: (guest: { name: string; email: string; phone: string }) => void
}) {
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [open, setOpen] = useState(false)

  async function search(q: string) {
    onChange(q)
    if (q.length < 2) { setSuggestions([]); setOpen(false); return }
    const res = await fetch(`/api/admin/guests/search?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    setSuggestions(data.guests || [])
    setOpen(true)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text" value={value}
        onChange={e => search(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="e.g. Marc Losier"
        style={{ width: '100%', padding: '10px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none', borderRadius: '2px', boxSizing: 'border-box' as const }}
      />
      {open && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#2A2A28', border: '0.5px solid #4A4A48', zIndex: 50, maxHeight: '200px', overflowY: 'auto' }}>
          {suggestions.map((g: any) => (
            <div key={g.id}
              onMouseDown={() => { onSelect(g); setOpen(false) }}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '0.5px solid #363634' }}>
              <div style={{ fontSize: '13px', color: '#F5F2EC', fontWeight: 500 }}>{g.name}</div>
              <div style={{ fontSize: '11px', color: '#9A9A92', marginTop: '2px' }}>
                {g.email?.includes('@platform.noemail') ? 'No email on file' : g.email}
                {g.bookingCount > 0 ? ` · ${g.bookingCount} stay${g.bookingCount !== 1 ? 's' : ''}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PlatformBookingForm({ block }: { block: any }) {
  const router = useRouter()
  const [guestEmail, setGuestEmail] = useState(block.guest_email || '')
  const [guestPhone, setGuestPhone] = useState(block.guest_phone || '')
  const [payment, setPayment] = useState({
    nightly_rate: block.nightly_rate || '',
    accommodation: block.accommodation || '',
    cleaning_fee: block.cleaning_fee || '',
    host_service_fee_pct: block.host_service_fee_pct || 3.0,
    taxes_collected: block.taxes_collected || '',
    extras: block.extras || '',
    discount: block.discount || '',
    discount_type: block.discount_type || 'Length of stay discount',
  })

  const [form, setForm] = useState({
    guest_name: block.guest_name || '',
    guest_notes: block.guest_notes || '',
    notes: block.notes || '',
    early_checkin_time: block.early_checkin_time || '',
    early_checkin_granted: block.early_checkin_granted ?? null,
    late_checkout_time: block.late_checkout_time || '',
    late_checkout_granted: block.late_checkout_granted ?? null,
  })
  const nights = block.start_date && block.end_date
    ? Math.round((new Date(block.end_date).getTime() - new Date(block.start_date).getTime()) / 86400000)
    : 0

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function set(key: string, value: unknown) {
    setForm(f => ({ ...f, [key]: value }))
    setSaved(false)
  }

  // payment calculations
  const nightlyNum = parseFloat(String(payment.nightly_rate)) || 0
  const accomNum = parseFloat(String(payment.accommodation)) || (nightlyNum * nights)
  const cleaningNum = parseFloat(String(payment.cleaning_fee)) || 0
  const discountNum = parseFloat(String(payment.discount)) || 0
  const feeBase = accomNum - discountNum + cleaningNum
  const hostFeeAmt = Math.round(feeBase * (payment.host_service_fee_pct / 100) * 100) / 100
  const taxesNum = parseFloat(String(payment.taxes_collected)) || 0
  const extrasNum = parseFloat(String(payment.extras)) || 0
  const payout = Math.round((feeBase - hostFeeAmt + extrasNum) * 100) / 100
  const guestTotal = Math.round((feeBase + taxesNum) * 100) / 100

  function setP(key: string, value: unknown) {
    setPayment(p => ({ ...p, [key]: value }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await fetch(`/api/admin/calendar/block/${block.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          guest_email: guestEmail,
          guest_phone: guestPhone,
          nightly_rate: nightlyNum || null,
          accommodation: accomNum || null,
          cleaning_fee: cleaningNum || null,
          host_service_fee_pct: payment.host_service_fee_pct,
          host_service_fee: hostFeeAmt || null,
          taxes_collected: taxesNum || null,
          extras: extrasNum || null,
          discount: discountNum || null,
          discount_type: discountNum ? payment.discount_type : null,
          payout_amount: payout || null,
          guest_total: guestTotal || null,
          amount_paid: payout || null,
        }),
      })
      // sync to guests table and link back to block
      if (form.guest_name) {
        const gRes = await fetch('/api/admin/guests/sync-platform', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.guest_name,
            email: guestEmail,
            phone: guestPhone,
            property_id: block.property_id,
            platform: block.platform,
          }),
        })
        const gData = await gRes.json()
        if (gData.guest_id) {
          await fetch(`/api/admin/calendar/block/${block.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guest_id: gData.guest_id }),
          })
        }
      }
      setSaved(true)
      router.refresh()
    } catch {}
    finally { setSaving(false) }
  }

  return (
    <div style={{ maxWidth: '600px' }}>
      <Section title="Guest info">
        <Field label="Guest name">
          <GuestAutocomplete
            value={form.guest_name}
            onChange={v => set('guest_name', v)}
            onSelect={g => {
              set('guest_name', g.name)
              setGuestEmail(g.email?.includes('@platform.noemail') ? '' : (g.email || ''))
              setGuestPhone(g.phone || '')
            }}
          />
        </Field>
        <Field label="Email">
          <input type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} placeholder="guest@email.com" style={inputStyle} />
        </Field>
        <Field label="Phone">
          <input type="tel" value={guestPhone} onChange={e => setGuestPhone(e.target.value.replace(/[^\d+\-\s()]/g, ''))} placeholder="+1 416 000 0000" style={inputStyle} />
        </Field>
        <Field label="Guest notes">
          <textarea value={form.guest_notes} onChange={e => set('guest_notes', e.target.value)} rows={3} placeholder="Special requests, allergies, notes..." style={{ ...inputStyle, resize: 'vertical' }} />
        </Field>
        <Field label="Internal notes">
          <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal only" style={inputStyle} />
        </Field>
      </Section>

      <Section title="Check-in time">
        <Field label="Requested check-in time">
          <select value={form.early_checkin_time} onChange={e => set('early_checkin_time', e.target.value)}
            style={{ ...inputStyle, maxWidth: '200px', background: '#363634' }}>
            <option value="">Standard (4:00 PM)</option>
            {Array.from({ length: 24 }, (_, h) => ['00','30'].map(m => {
              const val = `${String(h).padStart(2,'0')}:${m}`
              const ampm = h >= 12 ? 'PM' : 'AM'
              const h12 = h % 12 || 12
              return <option key={val} value={val}>{h12}:{m} {ampm}</option>
            })).flat()}
          </select>
        </Field>
        <Field label="Status">
          <ApprovalButtons value={form.early_checkin_granted} onChange={v => set('early_checkin_granted', v)} />
        </Field>
        <div style={{ fontSize: '11px', color: '#666660' }}>Standard check-in: 4:00 PM. Leave blank if standard.</div>
      </Section>

      <Section title="Checkout time">
        <Field label="Requested checkout time">
          <select value={form.late_checkout_time} onChange={e => set('late_checkout_time', e.target.value)}
            style={{ ...inputStyle, maxWidth: '200px', background: '#363634' }}>
            <option value="">Standard (11:00 AM)</option>
            {Array.from({ length: 24 }, (_, h) => ['00','30'].map(m => {
              const val = `${String(h).padStart(2,'0')}:${m}`
              const ampm = h >= 12 ? 'PM' : 'AM'
              const h12 = h % 12 || 12
              return <option key={val} value={val}>{h12}:{m} {ampm}</option>
            })).flat()}
          </select>
        </Field>
        <Field label="Status">
          <ApprovalButtons value={form.late_checkout_granted} onChange={v => set('late_checkout_granted', v)} />
        </Field>
        <div style={{ fontSize: '11px', color: '#666660' }}>Standard checkout: 11:00 AM. Leave blank if standard.</div>
      </Section>

      <Section title="Payment breakdown">
        <div style={{ background: '#1E1E1C', border: '0.5px solid #363634', padding: '16px' }}>
          {/* nightly rate */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <Field label="Nightly rate ($)">
              <input type="number" value={payment.nightly_rate} onChange={e => { setP('nightly_rate', e.target.value); setP('accommodation', (parseFloat(e.target.value)||0) * nights) }} placeholder="0.00" style={inputStyle} />
            </Field>
            <Field label="Nights">
              <div style={{ padding: '10px 12px', background: '#2A2A28', border: '0.5px solid #4A4A48', fontSize: '13px', color: '#9A9A92' }}>{nights}</div>
            </Field>
          </div>

          {/* rows */}
          {[
            { label: `Accommodation${nightlyNum ? ` (${nightlyNum} × ${nights})` : ''}`, key: 'accommodation', value: payment.accommodation, placeholder: nightlyNum ? String(nightlyNum * nights) : '0.00', editable: true },
            { label: 'Cleaning fee', key: 'cleaning_fee', value: payment.cleaning_fee, placeholder: '0.00', editable: true },
          ].map(({ label, key, value, placeholder, editable }) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid #2A2A28' }}>
              <div style={{ fontSize: '13px', color: '#9A9A92' }}>{label}</div>
              {editable ? (
                <input type="number" value={value} onChange={e => setP(key, e.target.value)} placeholder={placeholder}
                  style={{ width: '120px', padding: '6px 10px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none', textAlign: 'right' }} />
              ) : (
                <div style={{ fontSize: '13px', color: '#F5F2EC' }}>${(parseFloat(String(value))||0).toFixed(2)}</div>
              )}
            </div>
          ))}

          {/* discount */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid #2A2A28' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '13px', color: '#9A9A92' }}>Discount</div>
              <select value={payment.discount_type} onChange={e => setP('discount_type', e.target.value)}
                style={{ padding: '4px 8px', background: '#363634', border: '0.5px solid #4A4A48', color: '#9A9A92', fontFamily: 'var(--sans)', fontSize: '11px', outline: 'none' }}>
                <option>Length of stay discount</option>
                <option>Special offer</option>
                <option>Other</option>
              </select>
            </div>
            <input type="number" value={payment.discount} onChange={e => setP('discount', e.target.value)} placeholder="0.00"
              style={{ width: '120px', padding: '6px 10px', background: '#363634', border: '0.5px solid #4A4A48', color: '#e74c3c', fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none', textAlign: 'right' }} />
          </div>

          {/* host service fee */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid #2A2A28' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '13px', color: '#9A9A92' }}>Host service fee</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input type="number" value={payment.host_service_fee_pct} onChange={e => setP('host_service_fee_pct', parseFloat(e.target.value)||3)}
                  style={{ width: '50px', padding: '4px 8px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '12px', outline: 'none', textAlign: 'center' }} />
                <span style={{ fontSize: '12px', color: '#555550' }}>%</span>
              </div>
            </div>
            <div style={{ fontSize: '13px', color: '#e74c3c' }}>−${hostFeeAmt.toFixed(2)}</div>
          </div>

          {/* extras */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid #2A2A28' }}>
            <div style={{ fontSize: '13px', color: '#9A9A92' }}>Extras</div>
            <input type="number" value={payment.extras} onChange={e => setP('extras', e.target.value)} placeholder="0.00"
              style={{ width: '120px', padding: '6px 10px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none', textAlign: 'right' }} />
          </div>

          {/* payout */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '0.5px solid #2A2A28', borderTop: '0.5px solid #363634', marginTop: '4px' }}>
            <div style={{ fontSize: '13px', color: '#F5F2EC', fontWeight: 500 }}>Your payout</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '22px', fontWeight: 300, color: 'var(--amber)' }}>${payout.toFixed(2)}</div>
          </div>

          {/* taxes */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: '12px', color: '#555550' }}>Taxes collected (by platform)</div>
            <input type="number" value={payment.taxes_collected} onChange={e => setP('taxes_collected', e.target.value)} placeholder="0.00"
              style={{ width: '120px', padding: '6px 10px', background: '#2A2A28', border: '0.5px solid #363634', color: '#555550', fontFamily: 'var(--sans)', fontSize: '12px', outline: 'none', textAlign: 'right' }} />
          </div>
        </div>
      </Section>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '12px 32px', background: saving ? '#363634' : 'var(--amber)', color: saving ? '#9A9A92' : '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500 }}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        {saved && <span style={{ fontSize: '11px', color: '#2ecc71', letterSpacing: '.1em', textTransform: 'uppercase' }}>Saved</span>}
      </div>
    </div>
  )
}
