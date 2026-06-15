'use client'
import { useState, useEffect } from 'react'
import { Property } from '@/lib/properties'
import DateRangePicker from './DateRangePicker'
import { calcStay, type PricingConfig, type Override } from '@/lib/pricing'

export default function BookingWidget({ property }: { property: Property }) {
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [guests, setGuests] = useState(2)
  const [blockedDates, setBlockedDates] = useState<{ start: string; end: string }[]>([])
  const [pricing, setPricing] = useState<{ config: PricingConfig | null; overrides: Override[] }>({ config: null, overrides: [] })

  useEffect(() => {
    fetch(`/api/calendar?property=${property.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.blocked) setBlockedDates(data.blocked) })
      .catch(() => {})
    fetch(`/api/pricing?property=${property.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setPricing({ config: data.config, overrides: data.overrides || [] }) })
      .catch(() => {})
  }, [property.id])

  const effConfig: PricingConfig = pricing.config || {
    property_id: property.id,
    base_rate: property.nightly,
    weekend_rate: null,
    min_stay: property.minStay,
    cleaning_fee: property.cleaningFee,
  }
  const displayRate = Number(effConfig.base_rate)
  const cleaningFee = Number(effConfig.cleaning_fee) || property.cleaningFee
  const effMinStay = Number(effConfig.min_stay) || property.minStay

  const stay = checkIn && checkOut
    ? calcStay(checkIn, checkOut, effConfig, pricing.overrides)
    : { nights: [], nightCount: 0, accommodation: 0, avgRate: 0, requiredMinStay: effMinStay }
  const nights = stay.nightCount
  const accommodation = stay.accommodation
  const matAmount = Math.round(accommodation * property.mat)
  const hstAmount = Math.round((accommodation + cleaningFee) * property.hst)
  const total = accommodation + cleaningFee + matAmount + hstAmount
  const deposit = Math.round(total * property.depositPercent / 100)
  const canBook = nights >= stay.requiredMinStay

  return (
    <div style={{ border: '0.5px solid var(--sand-mid)', background: 'var(--chalk)', padding: '28px' }}>
      {/* price header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300, color: 'var(--noir)' }}>
            ${displayRate}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>/ night</span>
        </div>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--amber)', marginTop: '4px' }}>
          {effMinStay} night minimum · Book direct & save
        </div>
      </div>

      {/* calendar */}
      <div style={{ marginBottom: '16px' }}>
        <DateRangePicker
          blockedDates={blockedDates}
          minStay={effMinStay}
          onRangeChange={(ci, co) => { setCheckIn(ci); setCheckOut(co) }}
        />
      </div>

      {/* guests */}
      <div style={{
        background: 'var(--linen)', padding: '12px 14px',
        border: '0.5px solid var(--sand)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '20px',
      }}>
        <div>
          <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '4px' }}>
            Guests
          </div>
          <div style={{ fontSize: '13px', color: 'var(--noir)' }}>{guests} guest{guests !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setGuests(g => Math.max(1, g - 1))} style={{ width: '28px', height: '28px', borderRadius: '50%', border: '0.5px solid var(--sand-mid)', background: 'white', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
          <span style={{ fontSize: '14px', color: 'var(--noir)', minWidth: '16px', textAlign: 'center' }}>{guests}</span>
          <button onClick={() => setGuests(g => Math.min(property.guests, g + 1))} style={{ width: '28px', height: '28px', borderRadius: '50%', border: '0.5px solid var(--sand-mid)', background: 'white', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        </div>
      </div>

      {/* price breakdown */}
      {nights > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { label: stay.nights.length > 0 && stay.nights.every(n => n.rate === stay.nights[0].rate) ? `$${stay.avgRate} × ${nights} nights` : `${nights} nights (avg $${stay.avgRate})`, value: `$${accommodation}` },
              { label: 'Cleaning fee', value: `$${cleaningFee}` },
              { label: `HST (${Math.round(property.hst * 100)}%)`, value: `$${hstAmount}` },
              { label: `MAT (${Math.round(property.mat * 100)}%)`, value: `$${matAmount}` },
              { label: 'Platform fees', value: '$0', accent: true },
            ].map(({ label, value, accent }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: accent ? 'var(--amber)' : 'var(--muted)' }}>
                <span>{label}</span><span>{value}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 500, color: 'var(--noir)', borderTop: '0.5px solid var(--sand)', paddingTop: '10px' }}>
              <span>Total</span><span>${total}</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--amber)', textAlign: 'right' }}>
              ${deposit} due today ({property.depositPercent}% deposit)
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      {(() => {
        const href = canBook
          ? `/booking/${property.id}?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`
          : '#'
        const label = !checkIn ? 'Select dates to continue'
          : !checkOut ? 'Select checkout date'
          : nights < property.minStay ? `${property.minStay} night minimum`
          : 'Reserve now'
        return (
          <a href={href} style={{
            display: 'block', width: '100%', padding: '14px',
            background: canBook ? 'var(--noir)' : 'var(--sand)',
            color: canBook ? 'var(--chalk)' : 'var(--muted)',
            fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase',
            textAlign: 'center', borderRadius: '2px',
            pointerEvents: (canBook ? 'auto' : 'none') as React.CSSProperties['pointerEvents'],
          }}>{label}</a>
        )
      })()}

      {canBook && (
        <div style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', marginTop: '10px' }}>
          {property.depositPercent}% due today · No platform fees
        </div>
      )}

      {/* check-in/out times */}
      <div style={{ borderTop: '0.5px solid var(--sand)', marginTop: '20px', paddingTop: '16px', display: 'flex', justifyContent: 'space-between' }}>
        {[{ label: 'Check in', value: property.checkIn }, { label: 'Check out', value: property.checkOut }].map(({ label, value }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '4px' }}>{label}</div>
            <div style={{ fontSize: '13px', color: 'var(--noir)' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
