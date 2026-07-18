'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { addDays, format } from 'date-fns'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

const calcRowStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '180px 1fr 100px',
  alignItems: 'center', gap: '10px', padding: '6px 0',
  borderBottom: '0.5px solid #2A2A28',
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: '12px', color: '#9A9A92', ...style }}>{children}</div>
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', width: 'fit-content' }}>
      <div style={{ width: '32px', height: '18px', borderRadius: '9px', background: value ? 'var(--amber)' : '#4A4A48', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
        <div style={{ position: 'absolute', top: '2px', left: value ? '16px' : '2px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
      </div>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} style={{ display: 'none' }} />
    </label>
  )
}

function TimeSelect({ value, onChange, standard }: { value: string; onChange: (v: string) => void; standard: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
      <option value="">Standard ({standard})</option>
      {Array.from({ length: 24 }, (_, h) => ['00', '30'].map(m => {
        const val = `${String(h).padStart(2, '0')}:${m}`
        const ampm = h >= 12 ? 'PM' : 'AM'
        const h12 = h % 12 || 12
        return <option key={val} value={val}>{h12}:{m} {ampm}</option>
      })).flat()}
    </select>
  )
}

export default function BookingEditForm({ booking }: { booking: any }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // stay fields
  const [checkIn, setCheckIn] = useState(booking.check_in || '')
  const [checkOut, setCheckOut] = useState(booking.check_out || '')
  const [adults, setAdults] = useState(booking.guests_adults || booking.guests || 2)
  const [children, setChildren] = useState(booking.guests_children || 0)
  const [earlyCheckin, setEarlyCheckin] = useState(booking.early_checkin || false)
  const [earlyCheckinTime, setEarlyCheckinTime] = useState(booking.early_checkin_time || '')
  const [lateCheckout, setLateCheckout] = useState(booking.late_checkout || false)
  const [lateCheckoutTime, setLateCheckoutTime] = useState(booking.late_checkout_time || '')
  const [bagDrop, setBagDrop] = useState(booking.bag_drop || 'none')
  const [instacart, setInstacart] = useState(booking.instacart_requested || false)
  const [vehicleCount, setVehicleCount] = useState(booking.vehicle_count || 0)
  const [status, setStatus] = useState(booking.status || 'confirmed')
  const [paymentMethod, setPaymentMethod] = useState(booking.payment_method || 'etransfer')
  const [lockCode, setLockCode] = useState(booking.lock_code || '')

  // pricing fields
  const [accommodation, setAccommodation] = useState(booking.accommodation || '')
  const [cleaningFee, setCleaningFee] = useState(booking.cleaning_fee || '')
  const [applyHst, setApplyHst] = useState(!!booking.hst)
  const [applyMat, setApplyMat] = useState(!!booking.mat)
  const [useSecondPayment, setUseSecondPayment] = useState(
    booking.second_payment_amount != null && booking.second_payment_amount > 0
  )
  const [depositPaidAt, setDepositPaidAt] = useState(booking.deposit_paid_at ? booking.deposit_paid_at.split('T')[0] : '')
  const [secondPaidAt, setSecondPaidAt] = useState(booking.second_paid_at ? booking.second_paid_at.split('T')[0] : '')
  const [finalPaidAt, setFinalPaidAt] = useState(booking.final_paid_at ? booking.final_paid_at.split('T')[0] : '')
  const [securityDeposit, setSecurityDeposit] = useState(booking.security_deposit_status || 'none')

  // calculated values
  const accomNum = parseFloat(String(accommodation)) || 0
  const cleaningNum = parseFloat(String(cleaningFee)) || 0
  const subtotal = accomNum + cleaningNum
  const hstAmount = applyHst ? Math.round(subtotal * 0.13 * 100) / 100 : 0
  const matAmount = applyMat ? Math.round(accomNum * 0.04 * 100) / 100 : 0
  const total = subtotal + hstAmount + matAmount
  const deposit = Math.round(total * 0.10 * 100) / 100
  const remaining = Math.round((total - deposit) * 100) / 100
  const secondPayment = useSecondPayment ? Math.round(remaining * 0.5 * 100) / 100 : 0
  const finalPayment = useSecondPayment ? Math.round(remaining * 0.5 * 100) / 100 : remaining

  // auto-calculate dates
  const finalDueDate = checkIn ? format(addDays(new Date(checkIn + 'T12:00:00'), -30), 'yyyy-MM-dd') : ''
  const secondDueDate = checkIn ? format(addDays(new Date(checkIn + 'T12:00:00'), -60), 'yyyy-MM-dd') : ''

  async function handleSave() {
    setSaving(true)
    try {
      await fetch(`/api/admin/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          check_in: checkIn,
          check_out: checkOut,
          guests: adults + children,
          guests_adults: adults,
          guests_children: children,
          early_checkin: earlyCheckin,
          early_checkin_time: earlyCheckinTime || null,
          late_checkout: lateCheckout,
          late_checkout_time: lateCheckoutTime || null,
          bag_drop: bagDrop,
          instacart_requested: instacart,
          vehicle_count: vehicleCount,
          status,
          payment_method: paymentMethod,
          lock_code: lockCode || null,
          accommodation: accomNum || null,
          cleaning_fee: cleaningNum || null,
          hst: hstAmount || null,
          mat: matAmount || null,
          total: total || null,
          deposit_amount: deposit || null,
          deposit_paid_at: depositPaidAt || null,
          second_payment_amount: useSecondPayment ? secondPayment : null,
          second_due_date: useSecondPayment ? secondDueDate : null,
          second_paid_at: secondPaidAt || null,
          final_payment_amount: finalPayment || null,
          final_due_date: finalDueDate || null,
          final_paid_at: finalPaidAt || null,
          security_deposit_status: securityDeposit,
        }),
      })
      setSaved(true)
      router.refresh()
    } catch {}
    finally { setSaving(false) }
  }

  const sectionLabel = (text: string) => (
    <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', margin: '20px 0 12px' }}>{text}</div>
  )

  const field = (label: string, input: React.ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
      <Label>{label}</Label>
      <div>{input}</div>
    </div>
  )

  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px' }}>

      {sectionLabel('Stay')}
      {field('Property', <div style={{ fontSize: '13px', color: '#666660' }}>{booking.property_id}</div>)}
      {field('Status', (
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
          {['pending_payment','confirmed','active','completed','cancelled'].map(s => (
            <option key={s} value={s}>{s.replace('_',' ')}</option>
          ))}
        </select>
      ))}
      {field('Check-in', <input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} style={inputStyle} />)}
      {field('Check-out', <input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} min={checkIn} style={inputStyle} />)}
      {field('Adults (18+)', <input type="number" value={adults} onChange={e => setAdults(parseInt(e.target.value)||1)} min={1} style={inputStyle} />)}
      {field('Children (under 18)', <input type="number" value={children} onChange={e => setChildren(parseInt(e.target.value)||0)} min={0} style={inputStyle} />)}
      {field('Payment method', (
        <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
          <option value="etransfer">E-transfer</option>
          <option value="card">Credit card</option>
          <option value="cash">Cash</option>
        </select>
      ))}

      {sectionLabel('Check-in / checkout')}
      {field('Lock code (last 4)', (
        <div>
          <input value={lockCode} onChange={e => setLockCode(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="from Airbnb/VRBO if no phone" style={inputStyle} />
        </div>
      ))}
      {field('Early check-in', (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Toggle value={earlyCheckin} onChange={setEarlyCheckin} />
          {earlyCheckin && <TimeSelect value={earlyCheckinTime} onChange={setEarlyCheckinTime} standard="4:00 PM" />}
        </div>
      ))}
      {field('Late checkout', (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Toggle value={lateCheckout} onChange={setLateCheckout} />
          {lateCheckout && <TimeSelect value={lateCheckoutTime} onChange={setLateCheckoutTime} standard="11:00 AM" />}
        </div>
      ))}

      {sectionLabel('Add-ons')}
      {field('Bag drop', (
        <select value={bagDrop} onChange={e => setBagDrop(e.target.value)} style={{ ...inputStyle, background: '#363634' }}>
          <option value="none">None</option>
          <option value="drop-off">Drop-off</option>
          <option value="pick-up">Pick-up</option>
          <option value="both">Both</option>
        </select>
      ))}
      {field('Instacart', <Toggle value={instacart} onChange={setInstacart} />)}
      {field('Vehicles', <input type="number" value={vehicleCount} onChange={e => setVehicleCount(parseInt(e.target.value)||0)} min={0} style={{ ...inputStyle, maxWidth: '80px' }} />)}

      {sectionLabel('Pricing calculator')}
      <div style={{ background: '#1E1E1C', border: '0.5px solid #363634', padding: '16px', marginBottom: '8px' }}>
        <div style={calcRowStyle}>
          <Label>Accommodation</Label>
          <input type="number" value={accommodation} onChange={e => setAccommodation(e.target.value)} placeholder="0.00" style={{ ...inputStyle, background: '#2A2A28' }} />
          <div />
        </div>
        <div style={calcRowStyle}>
          <Label>Cleaning fee</Label>
          <input type="number" value={cleaningFee} onChange={e => setCleaningFee(e.target.value)} placeholder="0.00" style={{ ...inputStyle, background: '#2A2A28' }} />
          <div />
        </div>
        <div style={calcRowStyle}>
          <Label>HST (13%)</Label>
          <Toggle value={applyHst} onChange={setApplyHst} />
          <div style={{ fontSize: '13px', color: applyHst ? '#F5F2EC' : '#555550', textAlign: 'right' }}>{applyHst ? `$${hstAmount.toFixed(2)}` : '—'}</div>
        </div>
        <div style={calcRowStyle}>
          <Label>MAT (4%)</Label>
          <Toggle value={applyMat} onChange={setApplyMat} />
          <div style={{ fontSize: '13px', color: applyMat ? '#F5F2EC' : '#555550', textAlign: 'right' }}>{applyMat ? `$${matAmount.toFixed(2)}` : '—'}</div>
        </div>
        <div style={{ ...calcRowStyle, borderBottom: 'none', paddingTop: '12px', marginTop: '4px', borderTop: '0.5px solid #363634' }}>
          <Label style={{ color: '#F5F2EC', fontWeight: 500 }}>Total</Label>
          <div />
          <div style={{ fontSize: '16px', color: 'var(--amber)', fontWeight: 500, textAlign: 'right' }}>${total.toFixed(2)}</div>
        </div>
      </div>

      {sectionLabel('Payment schedule')}
      <div style={{ background: '#1E1E1C', border: '0.5px solid #363634', padding: '16px' }}>
        <div style={calcRowStyle}>
          <Label>Deposit (10%)</Label>
          <div style={{ fontSize: '13px', color: '#F5F2EC' }}>${deposit.toFixed(2)}</div>
          <div />
        </div>
        <div style={{ ...calcRowStyle, alignItems: 'start' }}>
          <Label style={{ paddingTop: '8px' }}>Deposit paid</Label>
          <input type="date" value={depositPaidAt} onChange={e => setDepositPaidAt(e.target.value)} style={{ ...inputStyle, background: '#2A2A28' }} />
          <div />
        </div>

        <div style={{ ...calcRowStyle, marginTop: '8px', paddingTop: '12px', borderTop: '0.5px solid #363634' }}>
          <Label>Second payment</Label>
          <Toggle value={useSecondPayment} onChange={setUseSecondPayment} />
          <div style={{ fontSize: '13px', color: useSecondPayment ? '#F5F2EC' : '#555550', textAlign: 'right' }}>{useSecondPayment ? `$${secondPayment.toFixed(2)}` : '—'}</div>
        </div>
        {useSecondPayment && (
          <>
            <div style={calcRowStyle}>
              <Label>2nd due date</Label>
              <div style={{ fontSize: '12px', color: '#9A9A92' }}>{secondDueDate ? format(new Date(secondDueDate + 'T12:00:00'), 'MMM d, yyyy') : '—'} <span style={{ color: '#555550' }}>(60 days before)</span></div>
              <div />
            </div>
            <div style={{ ...calcRowStyle, alignItems: 'start' }}>
              <Label style={{ paddingTop: '8px' }}>2nd paid</Label>
              <input type="date" value={secondPaidAt} onChange={e => setSecondPaidAt(e.target.value)} style={{ ...inputStyle, background: '#2A2A28' }} />
              <div />
            </div>
          </>
        )}

        <div style={{ ...calcRowStyle, marginTop: '8px', paddingTop: '12px', borderTop: '0.5px solid #363634' }}>
          <Label>Final payment</Label>
          <div style={{ fontSize: '13px', color: '#F5F2EC' }}>${finalPayment.toFixed(2)}</div>
          <div />
        </div>
        <div style={calcRowStyle}>
          <Label>Final due date</Label>
          <div style={{ fontSize: '12px', color: '#9A9A92' }}>{finalDueDate ? format(new Date(finalDueDate + 'T12:00:00'), 'MMM d, yyyy') : '—'} <span style={{ color: '#555550' }}>(30 days before)</span></div>
          <div />
        </div>
        <div style={{ ...calcRowStyle, alignItems: 'start' }}>
          <Label style={{ paddingTop: '8px' }}>Final paid</Label>
          <input type="date" value={finalPaidAt} onChange={e => setFinalPaidAt(e.target.value)} style={{ ...inputStyle, background: '#2A2A28' }} />
          <div />
        </div>

        <div style={{ ...calcRowStyle, marginTop: '8px', paddingTop: '12px', borderTop: '0.5px solid #363634' }}>
          <Label>Security deposit</Label>
          <select value={securityDeposit} onChange={e => setSecurityDeposit(e.target.value)} style={{ ...inputStyle, background: '#2A2A28' }}>
            <option value="none">None</option>
            <option value="pending">Pending</option>
            <option value="held">Held</option>
            <option value="released">Released</option>
          </select>
          <div />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '24px' }}>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '10px 28px', background: saving ? '#363634' : 'var(--amber)', color: saving ? '#9A9A92' : '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 500 }}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        {saved && <span style={{ fontSize: '11px', color: '#2ecc71', letterSpacing: '.1em', textTransform: 'uppercase' }}>✓ Saved</span>}
      </div>
    </div>
  )
}
