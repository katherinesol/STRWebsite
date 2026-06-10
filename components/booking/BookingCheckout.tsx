'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Property } from '@/lib/properties'
import { format, differenceInDays, addDays } from 'date-fns'

const CANCELLATION_POLICIES = {
  moderate: {
    title: 'Moderate cancellation policy',
    rules: [
      'Full refund if cancelled 14 or more days before check-in',
      '50% refund if cancelled 7–14 days before check-in',
      'No refund if cancelled within 7 days of check-in',
    ],
  },
  strict: {
    title: 'Strict cancellation policy',
    rules: [
      '50% refund if cancelled 30 or more days before check-in',
      'No refund if cancelled within 30 days of check-in',
      'The 10% deposit is non-refundable in all cases',
    ],
  },
}

const HST_NUMBER = 'Your HST Number'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '10px', fontWeight: 500, letterSpacing: '.16em',
      textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '12px',
    }}>
      {children}
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: '11px', fontWeight: 500, letterSpacing: '.1em',
        textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '6px',
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px',
  border: '0.5px solid var(--sand-mid)',
  fontFamily: 'var(--sans)', fontSize: '14px',
  color: 'var(--noir)', background: 'white', outline: 'none',
  borderRadius: '2px', boxSizing: 'border-box',
}

export default function BookingCheckout({ property }: { property: Property }) {
  const searchParams = useSearchParams()
  const checkIn = searchParams.get('checkIn') || ''
  const checkOut = searchParams.get('checkOut') || ''

  const [guestCount, setGuestCount] = useState(parseInt(searchParams.get('guests') || '2'))
  const [adultsCount, setAdultsCount] = useState(parseInt(searchParams.get('guests') || '2'))
  const [childrenCount, setChildrenCount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'etransfer'>('card')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [vehicleCount, setVehicleCount] = useState(0)
  const [plates, setPlates] = useState<string[]>(['', '', '', ''])
  const [platesPending, setPlatesPending] = useState(false)
  const [earlyCheckin, setEarlyCheckin] = useState(false)
  const [lateCheckout, setLateCheckout] = useState(false)
  const [earlyCheckinTime, setEarlyCheckinTime] = useState(property.earliestCheckinTime || '13:00')
  const [lateCheckoutTime, setLateCheckoutTime] = useState('13:00')
  const [bagDrop, setBagDrop] = useState<'none' | 'before' | 'after' | 'both'>('none')
  const [instacart, setInstacart] = useState(false)
  const [instacartNotes, setInstacartNotes] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [emailError, setEmailError] = useState('')
  const [phoneError, setPhoneError] = useState('')

  const [nameError, setNameError] = useState('')

  function validateName(val: string) {
    if (!val) { setNameError(''); return }
    const valid = val.trim().split(' ').length >= 2 && val.trim().length >= 4
    setNameError(valid ? '' : 'Enter your full name (first and last)')
  }

  function validateEmail(val: string) {
    if (!val) { setEmailError(''); return }
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)
    setEmailError(ok ? '' : 'Enter a valid email address')
  }

  function validatePhone(val: string) {
    if (!val) { setPhoneError(''); return }
    const digits = val.replace(/\D/g, '')
    setPhoneError(digits.length >= 10 ? '' : 'Enter a valid phone number (min 10 digits)')
  }
  const [bookingId, setBookingId] = useState('')
  const [bookingRef, setBookingRef] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState<'review' | 'confirmed'>('review')

  const nights = checkIn && checkOut
    ? differenceInDays(new Date(checkOut), new Date(checkIn))
    : 0

  const accommodation = nights * property.nightly
  const cleaning = property.cleaningFee
  const matAmount = Math.round(accommodation * property.mat)
  const hstAmount = Math.round((accommodation + cleaning) * property.hst)
  const total = accommodation + cleaning + matAmount + hstAmount
  const deposit = Math.round(total * property.depositPercent / 100)
  const second = Math.round(total * property.paymentSchedule.secondPercent / 100)
  const final = total - deposit - second

  const checkInDate = checkIn ? new Date(checkIn) : null
  const secondDueDate = checkInDate ? addDays(checkInDate, -property.paymentSchedule.secondDaysBefore) : null
  const finalDueDate = checkInDate ? addDays(checkInDate, -property.paymentSchedule.finalDaysBefore) : null

  const policy = CANCELLATION_POLICIES[property.cancellationPolicy]
  // early/late fees — $10/hour from standard times
  const standardCheckin = 16  // 4pm
  const standardCheckout = 11 // 11am
  const earlyCheckinHours = earlyCheckin ? standardCheckin - parseInt(earlyCheckinTime.split(':')[0]) : 0
  const lateCheckoutHours = lateCheckout ? parseInt(lateCheckoutTime.split(':')[0]) - standardCheckout : 0
  const addOnFee = (earlyCheckinHours + lateCheckoutHours) * 10

  const totalWithAddons = total + addOnFee
  const depositWithAddons = Math.round(totalWithAddons * property.depositPercent / 100)
  const secondWithAddons = Math.round(totalWithAddons * property.paymentSchedule.secondPercent / 100)
  const finalWithAddons = totalWithAddons - depositWithAddons - secondWithAddons

  const px = 'clamp(20px, 5vw, 64px)'

  const nameValid = name.trim().split(' ').length >= 2 && name.trim().length >= 4
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const phoneValid = phone.replace(/\D/g, '').length >= 10
  const canSubmit = agreed && nameValid && emailValid && phoneValid && !nameError && !emailError && !phoneError &&
    (vehicleCount === 0 || platesPending || plates.slice(0, vehicleCount).every(p => p.trim()))

  if (step === 'confirmed') {
    return (
      <div style={{ padding: `80px ${px}`, maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>
          Booking confirmed
        </div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '48px', fontWeight: 300, color: 'var(--noir)', marginBottom: '16px', lineHeight: 1.05 }}>
          You&apos;re booked.
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.75, marginBottom: '32px' }}>
          A confirmation has been sent to <strong style={{ color: 'var(--noir)' }}>{email}</strong>.
          {paymentMethod === 'etransfer'
            ? ' Your booking will be confirmed within 24 hours of receiving your e-transfer.'
            : ' Your booking is confirmed. Your guest portal will be sent 48 hours before check-in.'}
          {platesPending && ' We\'ll send you a reminder to provide your licence plate(s) before check-in.'}
        </p>
        <div style={{ background: 'var(--linen)', border: '0.5px solid var(--sand)', padding: '24px', textAlign: 'left', marginBottom: '16px' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: '20px', fontWeight: 300, color: 'var(--noir)', marginBottom: '12px' }}>{property.name}</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.8 }}>
            {checkIn && format(new Date(checkIn), 'MMMM d, yyyy')} → {checkOut && format(new Date(checkOut), 'MMMM d, yyyy')}<br />
            {nights} nights · {guestCount} guest{guestCount !== 1 ? 's' : ''}<br />
            Check-in at {property.checkIn} · Checkout at {property.checkOut}<br />
            {earlyCheckin && 'Early check-in requested · '}
            {lateCheckout && 'Late checkout requested'}
          </div>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '32px' }}>
          HST #{HST_NUMBER}
        </div>
        <a href="/" style={{ fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--noir)', borderBottom: '0.5px solid var(--noir)', paddingBottom: '2px' }}>
          Back to home
        </a>
      </div>
    )
  }

  return (
    <div style={{ padding: `48px ${px} 96px`, maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ borderBottom: '0.5px solid var(--sand)', paddingBottom: '20px', marginBottom: '40px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '8px' }}>
          Direct booking
        </div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 300, color: 'var(--noir)', lineHeight: 1.05 }}>
          Confirm your stay.
        </h1>
      </div>

      <style>{`@media (max-width: 900px) { .checkout-grid { grid-template-columns: 1fr !important; } .checkout-sidebar { position: static !important; order: -1; } }`}</style>
      <div className="checkout-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '60px', alignItems: 'start' }}>
        <div>

          {/* guest details */}
          <div style={{ marginBottom: '40px' }}>
            <SectionLabel>Your details</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <FormField label="Full name">
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
              </FormField>
              <FormField label="Email address">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@email.com" style={inputStyle} />
              </FormField>
              <FormField label="Phone number">
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 416 000 0000" style={inputStyle} />
              </FormField>

              {/* guest count */}
              <FormField label="Number of guests">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <button onClick={() => setGuestCount(g => Math.max(1, g - 1))} style={{ width: '32px', height: '32px', borderRadius: '50%', border: '0.5px solid var(--sand-mid)', background: 'white', fontSize: '18px', cursor: 'pointer' }}>−</button>
                  <span style={{ fontSize: '15px', color: 'var(--noir)', minWidth: '24px', textAlign: 'center' }}>{guestCount}</span>
                  <button onClick={() => setGuestCount(g => Math.min(property.guests, g + 1))} style={{ width: '32px', height: '32px', borderRadius: '50%', border: '0.5px solid var(--sand-mid)', background: 'white', fontSize: '18px', cursor: 'pointer' }}>+</button>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Max {property.guests} guests</span>
                </div>
              </FormField>
            </div>
          </div>

          {/* add-ons */}
          <div style={{ marginBottom: '40px' }}>
            <SectionLabel>Add-ons & requests</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {/* early check-in */}
              <div style={{ border: `0.5px solid ${earlyCheckin ? '#a8c9a0' : 'var(--sand)'}`, background: earlyCheckin ? '#f0f5ed' : 'var(--linen)' }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', cursor: 'pointer', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '14px', color: 'var(--noir)', fontWeight: earlyCheckin ? 500 : 400 }}>Early check-in</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>$10/hour · subject to availability · confirmed 24hrs before</div>
                  </div>
                  <div style={{ width: '36px', height: '20px', borderRadius: '10px', background: earlyCheckin ? '#4a8a42' : 'var(--sand-mid)', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
                    <div style={{ position: 'absolute', top: '2px', left: earlyCheckin ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                  </div>
                  <input type="checkbox" checked={earlyCheckin} onChange={e => setEarlyCheckin(e.target.checked)} style={{ display: 'none' }} />
                </label>
                {earlyCheckin && (
                  <div style={{ padding: '0 16px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Requested check-in time:</span>
                    <select
                      value={earlyCheckinTime}
                      onChange={e => setEarlyCheckinTime(e.target.value)}
                      style={{ padding: '6px 10px', border: '0.5px solid var(--sand-mid)', fontFamily: 'var(--sans)', fontSize: '13px', background: 'white', color: 'var(--noir)', borderRadius: '2px' }}
                    >
                      {Array.from({ length: 16 - parseInt(property.earliestCheckinTime || '10:00') }, (_, i) => {
                        const h = parseInt(property.earliestCheckinTime || '10:00') + i
                        return `${h.toString().padStart(2,'0')}:00`
                      }).map(t => {
                        const h = parseInt(t)
                        const label = h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h-12}:00 PM`
                        const hrs = 16 - h
                        return <option key={t} value={t}>{label} — {hrs} hr{hrs !== 1 ? 's' : ''} early · ${hrs * 10}</option>
                      })}
                    </select>
                  </div>
                )}
              </div>

              {/* late checkout */}
              <div style={{ border: `0.5px solid ${lateCheckout ? '#a8c9a0' : 'var(--sand)'}`, background: lateCheckout ? '#f0f5ed' : 'var(--linen)' }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', cursor: 'pointer', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '14px', color: 'var(--noir)', fontWeight: lateCheckout ? 500 : 400 }}>Late checkout</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>$10/hour · up to 2:00 PM · subject to availability · confirmed 24hrs before</div>
                  </div>
                  <div style={{ width: '36px', height: '20px', borderRadius: '10px', background: lateCheckout ? '#4a8a42' : 'var(--sand-mid)', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
                    <div style={{ position: 'absolute', top: '2px', left: lateCheckout ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                  </div>
                  <input type="checkbox" checked={lateCheckout} onChange={e => setLateCheckout(e.target.checked)} style={{ display: 'none' }} />
                </label>
                {lateCheckout && (
                  <div style={{ padding: '0 16px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Requested checkout time:</span>
                    <select
                      value={lateCheckoutTime}
                      onChange={e => setLateCheckoutTime(e.target.value)}
                      style={{ padding: '6px 10px', border: '0.5px solid var(--sand-mid)', fontFamily: 'var(--sans)', fontSize: '13px', background: 'white', color: 'var(--noir)', borderRadius: '2px' }}
                    >
                      {Array.from({ length: parseInt(property.latestCheckoutTime || '14:00') - 11 }, (_, i) => {
                        const h = 12 + i
                        return `${h.toString().padStart(2,'0')}:00`
                      }).map(t => {
                        const h = parseInt(t)
                        const label = h === 12 ? '12:00 PM' : `${h-12}:00 PM`
                        const hrs = h - 11
                        return <option key={t} value={t}>{label} — {hrs} hr{hrs !== 1 ? 's' : ''} late · ${hrs * 10}</option>
                      })}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* bag drop */}
          {property.bagDropAvailable && (
            <div style={{ marginBottom: '40px' }}>
              <SectionLabel>Bag drop</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                {[
                  { value: 'none', label: 'No bag drop needed' },
                  { value: 'before', label: 'Drop bags before check-in', sub: 'Leave luggage at the property before your room is ready' },
                  { value: 'after', label: 'Leave bags after checkout', sub: 'Keep bags at the property after checkout until you are ready' },
                  { value: 'both', label: 'Both — drop before & leave after' },
                ].map(opt => (
                  <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: bagDrop === opt.value ? 'var(--linen)' : 'white', border: `0.5px solid ${bagDrop === opt.value ? 'var(--sand-mid)' : 'var(--sand)'}`, cursor: 'pointer' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: `1.5px solid ${bagDrop === opt.value ? 'var(--noir)' : 'var(--sand-mid)'}`, background: bagDrop === opt.value ? 'var(--noir)' : 'white', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {bagDrop === opt.value && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'white' }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', color: 'var(--noir)', fontWeight: bagDrop === opt.value ? 500 : 400 }}>{opt.label}</div>
                      {opt.sub && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{opt.sub}</div>}
                    </div>
                    <input type="radio" name="bagdrop" value={opt.value} checked={bagDrop === opt.value} onChange={() => setBagDrop(opt.value as typeof bagDrop)} style={{ display: 'none' }} />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* instacart */}
          {property.instacartAvailable && (
            <div style={{ marginBottom: '40px' }}>
              <SectionLabel>Instacart grocery delivery</SectionLabel>
              <div style={{ background: 'var(--linen)', border: '0.5px solid var(--sand)', padding: '16px', marginBottom: '1px' }}>
                <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6 }}>
                  Place your own Instacart order to the property address — we will receive and store your groceries before you arrive.
                  Orders must be scheduled to arrive at least{' '}
                  <strong style={{ color: 'var(--noir)' }}>{property.instacartCutoffHours} hours</strong> before check-in.
                  The property address will be included in your booking confirmation.
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: instacart ? '#f0f5ed' : 'var(--linen)', border: `0.5px solid ${instacart ? '#a8c9a0' : 'var(--sand)'}`, cursor: 'pointer' }}>
                <div style={{ width: '36px', height: '20px', borderRadius: '10px', background: instacart ? '#4a8a42' : 'var(--sand-mid)', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
                  <div style={{ position: 'absolute', top: '2px', left: instacart ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                </div>
                <span style={{ fontSize: '14px', color: 'var(--noir)', fontWeight: instacart ? 500 : 400 }}>Yes, I plan to place an Instacart order before arrival</span>
                <input type="checkbox" checked={instacart} onChange={e => setInstacart(e.target.checked)} style={{ display: 'none' }} />
              </label>
              {instacart && (
                <div style={{ marginTop: '1px', background: 'var(--linen)', border: '0.5px solid var(--sand)', padding: '14px 16px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.6 }}>
                    Your booking confirmation will include the property address to use for your Instacart delivery.
                    Please ensure your order is scheduled to arrive at least {property.instacartCutoffHours} hours before{' '}
                    {checkIn ? format(new Date(checkIn), 'MMMM d') : 'check-in'} at {property.checkIn}.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* parking */}
          <div style={{ marginBottom: '40px' }}>
            <SectionLabel>Parking ({property.parkingSpots} spot{property.parkingSpots !== 1 ? 's' : ''} available)</SectionLabel>
            <div style={{ marginBottom: '14px' }}>
              <FormField label="Number of vehicles">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <button onClick={() => { setVehicleCount(v => Math.max(0, v - 1)); setPlatesPending(false) }} style={{ width: '32px', height: '32px', borderRadius: '50%', border: '0.5px solid var(--sand-mid)', background: 'white', fontSize: '18px', cursor: 'pointer' }}>−</button>
                  <span style={{ fontSize: '15px', color: 'var(--noir)', minWidth: '24px', textAlign: 'center' }}>{vehicleCount}</span>
                  <button onClick={() => setVehicleCount(v => Math.min(property.parkingSpots, v + 1))} style={{ width: '32px', height: '32px', borderRadius: '50%', border: '0.5px solid var(--sand-mid)', background: 'white', fontSize: '18px', cursor: 'pointer' }}>+</button>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Max {property.parkingSpots}</span>
                </div>
              </FormField>
            </div>

            {vehicleCount > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {!platesPending && Array.from({ length: vehicleCount }).map((_, i) => (
                  <FormField key={i} label={`Licence plate ${vehicleCount > 1 ? i + 1 : ''}`}>
                    <input
                      type="text"
                      value={plates[i]}
                      onChange={e => {
                        const updated = [...plates]
                        updated[i] = e.target.value.toUpperCase()
                        setPlates(updated)
                      }}
                      placeholder="e.g. ABCD 123"
                      style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '.1em' }}
                    />
                  </FormField>
                ))}
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginTop: '4px' }}>
                  <input type="checkbox" checked={platesPending} onChange={e => { setPlatesPending(e.target.checked); if (e.target.checked) setPlates(['', '', '', '']) }} />
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                    I&apos;ll provide plate info before check-in — you&apos;ll send me a reminder
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* referral code */}
          <div style={{ marginBottom: '40px' }}>
            <SectionLabel>Referral code (optional)</SectionLabel>
            <div style={{ maxWidth: '240px' }}>
              <input
                type="text"
                value={referralCode}
                onChange={e => setReferralCode(e.target.value.toUpperCase())}
                placeholder="Enter code"
                style={{
                  width: '100%', padding: '12px 14px',
                  border: '0.5px solid var(--sand-mid)',
                  fontFamily: 'var(--mono, monospace)', fontSize: '14px',
                  letterSpacing: '.12em', color: 'var(--noir)',
                  background: 'white', outline: 'none', borderRadius: '2px',
                  boxSizing: 'border-box' as const,
                }}
              />
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
                Have a friend who stayed with us? Enter their referral code for a discount.
              </div>
            </div>
          </div>

          {/* payment method */}
          <div style={{ marginBottom: '40px' }}>
            <SectionLabel>Payment method</SectionLabel>
            <div style={{ display: 'flex', gap: '1px', marginBottom: '16px' }}>
              {(['card', 'etransfer'] as const).map(method => (
                <button key={method} onClick={() => setPaymentMethod(method)} style={{ flex: 1, padding: '14px', background: paymentMethod === method ? 'var(--noir)' : 'var(--linen)', color: paymentMethod === method ? 'var(--chalk)' : 'var(--muted)', border: '0.5px solid var(--sand)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'var(--sans)' }}>
                  {method === 'card' ? 'Credit / Debit card' : 'E-transfer'}
                </button>
              ))}
            </div>
            {paymentMethod === 'card' ? (
              <div style={{ background: 'var(--linen)', border: '0.5px solid var(--sand)', padding: '20px' }}>
                <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '12px' }}>Card payment powered by Stripe. Your card details are never stored.</div>
                <div style={{ background: 'var(--sand)', height: '48px', borderRadius: '2px', display: 'flex', alignItems: 'center', paddingLeft: '14px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--stone)' }}>Stripe payment form loads here</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '10px' }}>Your booking will be confirmed immediately upon payment.</div>
              </div>
            ) : (
              <div style={{ background: 'var(--linen)', border: '0.5px solid var(--sand)', padding: '20px' }}>
                <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.7, marginBottom: '12px' }}>
                  Send your deposit of <strong style={{ color: 'var(--noir)' }}>${deposit}</strong> to:
                </div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--noir)', marginBottom: '4px' }}>[your-email@domain.com]</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.6 }}>
                  Use your name and check-in date as the message.<br />
                  Your booking will be confirmed within 24 hours of receipt.
                </div>
              </div>
            )}
          </div>

          {/* payment schedule */}
          <div style={{ marginBottom: '40px' }}>
            <SectionLabel>Payment schedule</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {[
                { label: `Deposit (${property.depositPercent}%)`, amount: depositWithAddons, date: 'Due today', note: 'Secures your booking' },
                { label: '50% of remaining balance', amount: secondWithAddons, date: secondDueDate ? format(secondDueDate, 'MMMM d, yyyy') : '60 days before check-in' },
                { label: 'Final payment', amount: finalWithAddons, date: finalDueDate ? format(finalDueDate, 'MMMM d, yyyy') : '30 days before check-in' },
              ].map(({ label, amount, date, note }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'var(--linen)', border: '0.5px solid var(--sand)' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: 'var(--noir)', fontWeight: 500 }}>{label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{date}{note ? ` · ${note}` : ''}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: '20px', fontWeight: 300, color: 'var(--noir)' }}>${amount}</div>
                </div>
              ))}
            </div>
          </div>

          {/* cancellation policy */}
          <div style={{ marginBottom: '40px' }}>
            <SectionLabel>Cancellation policy</SectionLabel>
            <div style={{ background: 'var(--linen)', border: '0.5px solid var(--sand)', padding: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--noir)', marginBottom: '12px' }}>{policy.title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {policy.rules.map(rule => (
                  <div key={rule} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--amber)', flexShrink: 0, marginTop: '6px', display: 'block' }} />
                    <span style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6 }}>{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* house rules */}
          <div style={{ marginBottom: '40px' }}>
            <SectionLabel>House rules</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {property.houseRules.map(rule => (
                <div key={rule} style={{ fontSize: '13px', color: 'var(--muted)', padding: '10px 0', borderBottom: '0.5px solid var(--sand)' }}>{rule}</div>
              ))}
            </div>
          </div>

          {/* agree + submit */}
          <label style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', cursor: 'pointer', marginBottom: '24px' }}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: '3px', flexShrink: 0 }} />
            <span style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6 }}>
              I agree to the house rules, cancellation policy, and confirm that all guests are 25 or older.
              I understand that my deposit of <strong style={{ color: 'var(--noir)' }}>${depositWithAddons}</strong> is due today and is non-refundable.
            </span>
          </label>

          <button
            disabled={!canSubmit || submitting}
            onClick={async () => {
              setSubmitting(true)
              try {
                const res = await fetch('/api/bookings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    property_id: property.id,
                    check_in: checkIn,
                    check_out: checkOut,
                    nights,
                    guests: adultsCount + childrenCount,
                    guests_adults: adultsCount,
                    guests_children: childrenCount,
                    payment_method: paymentMethod,
                    accommodation,
                    cleaning_fee: property.cleaningFee,
                    hst: hstAmount,
                    mat: matAmount,
                    addon_fee: addOnFee,
                    total: totalWithAddons,
                    deposit_amount: depositWithAddons,
                    second_payment_amount: secondWithAddons,
                    final_payment_amount: finalWithAddons,
                    second_due_date: secondDueDate ? format(secondDueDate, 'yyyy-MM-dd') : null,
                    final_due_date: finalDueDate ? format(finalDueDate, 'yyyy-MM-dd') : null,
                    early_checkin: earlyCheckin,
                    early_checkin_time: earlyCheckin ? earlyCheckinTime : null,
                    late_checkout: lateCheckout,
                    late_checkout_time: lateCheckout ? lateCheckoutTime : null,
                    bag_drop: bagDrop,
                    instacart_requested: instacart,
                    vehicle_count: vehicleCount,
                    plate_numbers: vehicleCount > 0 && !platesPending ? plates.slice(0, vehicleCount) : [],
                    plates_pending: platesPending,
                    guest_name: name,
                    guest_email: email,
                    guest_phone: phone,
                    referral_code: referralCode || null,
                  }),
                })
                const data = await res.json()
                if (res.ok) {
                  setBookingId(data.booking_id)
                  setBookingRef(data.booking_reference)
                  setStep('confirmed')
                } else {
                  alert(data.error || 'Something went wrong — please try again')
                }
              } catch {
                alert('Something went wrong — please try again')
              } finally {
                setSubmitting(false)
              }
            }}
            style={{
              width: '100%', padding: '16px',
              background: canSubmit ? 'var(--noir)' : 'var(--sand)',
              color: canSubmit ? 'var(--chalk)' : 'var(--muted)',
              border: 'none', fontFamily: 'var(--sans)',
              fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase',
              cursor: canSubmit ? 'pointer' : 'not-allowed', borderRadius: '2px',
            }}
          >
            {submitting ? 'Processing...' : `Confirm booking · $${depositWithAddons} due today`}
          </button>
        </div>

        {/* right — booking summary */}
        <div className="checkout-sidebar" style={{ position: 'sticky', top: '80px' }}>
          <div style={{ border: '0.5px solid var(--sand-mid)', padding: '24px', background: 'var(--chalk)' }}>
            <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '4px' }}>
              {property.neighbourhood} · {property.city}
            </div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '22px', fontWeight: 300, color: 'var(--noir)', marginBottom: '20px', lineHeight: 1.1 }}>
              {property.name}
            </div>

            {checkIn && checkOut && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderTop: '0.5px solid var(--sand)', borderBottom: '0.5px solid var(--sand)', marginBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '4px' }}>Check in</div>
                    <div style={{ fontSize: '13px', color: 'var(--noir)' }}>{format(new Date(checkIn), 'MMM d, yyyy')}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{property.checkIn}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '4px' }}>Check out</div>
                    <div style={{ fontSize: '13px', color: 'var(--noir)' }}>{format(new Date(checkOut), 'MMM d, yyyy')}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{property.checkOut}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
                  {[
                    { label: `$${property.nightly} × ${nights} nights`, value: `$${accommodation}` },
                    { label: 'Cleaning fee', value: `$${cleaning}` },
                    { label: `HST (${Math.round(property.hst * 100)}%)`, value: `$${hstAmount}` },
                    { label: `MAT (${Math.round(property.mat * 100)}%)`, value: `$${matAmount}` },
                    { label: 'Platform fees', value: '$0', accent: true },
                    ...(addOnFee > 0 ? [{ label: `Early/late add-ons`, value: `$${addOnFee}`, accent: false }] : []),
                  ].map(({ label, value, accent }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: accent ? 'var(--amber)' : 'var(--muted)' }}>
                      <span>{label}</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 500, color: 'var(--noir)', borderTop: '0.5px solid var(--sand)', paddingTop: '12px', marginBottom: '6px' }}>
                  <span>Total</span>
                  <span>${totalWithAddons}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--amber)', textAlign: 'right', marginBottom: '16px' }}>
                  ${depositWithAddons} due today
                </div>

                <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.7, borderTop: '0.5px solid var(--sand)', paddingTop: '14px' }}>
                  {guestCount} guest{guestCount !== 1 ? 's' : ''} · {nights} night{nights !== 1 ? 's' : ''}<br />
                  Security deposit: ${property.securityDeposit} (held separately)<br />
                  HST # {HST_NUMBER}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
