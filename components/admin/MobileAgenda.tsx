'use client'
import { useState } from 'react'
import Link from 'next/link'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'RY East',
  'royal-york-west': 'RY West',
  'nickel-beach': 'Nickel Beach',
}
const PLATFORM_COLORS: Record<string, string> = {
  airbnb: '#e74c3c', vrbo: '#3498db', houfy: '#2ecc71', direct: '#B8956B',
}

type Stay = {
  id: string
  property_id: string
  start: string
  end: string
  guest_name: string | null
  platform: string
  is_booking: boolean
  href: string
}

export default function MobileAgenda({ bookings, blocks }: { bookings: any[]; blocks: any[] }) {
  const [property, setProperty] = useState<string>('')
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })

  const stays: Stay[] = [
    ...bookings.map(b => ({
      id: b.id,
      property_id: b.property_id,
      start: b.check_in,
      end: b.check_out,
      guest_name: (Array.isArray(b.guest_info) ? b.guest_info[0]?.name : b.guest_info?.name) || b.guest_name || null,
      platform: 'direct',
      is_booking: true,
      href: `/admin/bookings/${b.id}`,
    })),
    ...blocks.map(b => ({
      id: b.id,
      property_id: b.property_id,
      start: b.start_date,
      end: b.end_date,
      guest_name: b.guest_name || null,
      platform: b.platform || 'manual',
      is_booking: b.is_booking === true,
      href: `/admin/bookings/block/${b.id}`,
    })),
  ]
    .filter(s => s.end >= todayStr)
    .filter(s => !property || s.property_id === property)
    .sort((a, b) => a.start.localeCompare(b.start))

  function fmtRange(start: string, end: string) {
    const f = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
    return `${f(start)} → ${f(end)}`
  }

  return (
    <div className="cal-agenda">
      <div className="filter-chips" style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        <button onClick={() => setProperty('')}
          style={{ padding: '8px 14px', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)', background: !property ? '#F5F2EC' : '#363634', color: !property ? '#1A1A18' : '#9A9A92' }}>
          All
        </button>
        {Object.entries(PROPERTY_NAMES).map(([id, name]) => (
          <button key={id} onClick={() => setProperty(id)}
            style={{ padding: '8px 14px', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)', background: property === id ? 'var(--amber)' : '#363634', color: property === id ? '#1A1A18' : '#9A9A92' }}>
            {name}
          </button>
        ))}
      </div>

      {!stays.length ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: '13px', color: '#666660' }}>
          Nothing upcoming
        </div>
      ) : stays.map(s => {
        const active = s.start <= todayStr && s.end >= todayStr
        return (
          <Link key={`${s.platform}-${s.id}`} href={s.href}
            style={{
              display: 'block', textDecoration: 'none',
              background: '#242422', border: '0.5px solid #363634',
              borderLeft: `2px solid ${PLATFORM_COLORS[s.platform] || '#666660'}`,
              padding: '12px 14px', marginBottom: '8px',
              opacity: s.is_booking ? 1 : .55,
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', color: '#F5F2EC', fontWeight: 500 }}>
                {s.guest_name || (s.is_booking ? 'Reserved' : 'Blocked / prep')}
              </div>
              <span style={{ fontSize: '9px', color: PLATFORM_COLORS[s.platform] || '#9A9A92', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                {s.platform}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              <div style={{ fontSize: '11px', color: '#9A9A92' }}>
                {PROPERTY_NAMES[s.property_id]} · {fmtRange(s.start, s.end)}
              </div>
              {active && <span style={{ fontSize: '9px', color: '#3498db', letterSpacing: '.08em', textTransform: 'uppercase' }}>Active</span>}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
