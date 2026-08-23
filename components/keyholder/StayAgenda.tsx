'use client'
import { useState } from 'react'
import Link from 'next/link'
import { unpaid } from '@/lib/keyholder/payment'
import { L, F, cardStyle, platformColour } from '@/lib/design-tokens'
import { getCheckInDisplay, getCheckOutDisplay } from '@/lib/checkin-times'

// Stays · Month, narrow. The grid needs seven columns to mean anything, so on a
// phone it becomes a list instead of a squeezed calendar — the same stays, in the
// order they happen, each still opening its booking.
//
// Grouped by day rather than by stay, because on a phone the question is "what is
// happening today" rather than "what does the month look like".

const PROPERTIES = [
  { id: 'nickel-beach', short: 'Nickel' },
  { id: 'royal-york-west', short: 'RY West' },
  { id: 'royal-york-east', short: 'RY East' },
]
const NAME: Record<string, string> = {
  'nickel-beach': 'Nickel Beach', 'royal-york-west': 'Royal York West', 'royal-york-east': 'Royal York East',
}

const n = (v: any) => Number(v) || 0
const startOf = (b: any) => b.check_in || b.start_date
const endOf = (b: any) => b.check_out || b.end_date
const sourceOf = (b: any) => (b.check_in ? 'direct' : String(b.platform || 'manual').toLowerCase())
const guestName = (b: any) =>
  (Array.isArray(b.guest_info) ? b.guest_info[0]?.name : b.guest_info?.name) || b.guest_name || 'Guest'
const hrefFor = (b: any) => (b.check_in ? `/admin/bookings/${b.id}` : `/admin/bookings/block/${b.id}`)

/* UNPAID lives in lib/keyholder/payment.ts — see the note there. */

const fmt = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })

export default function StayAgenda({ bookings, blocks }: { bookings: any[]; blocks: any[] }) {
  const [prop, setProp] = useState('')
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })

  const stays = [
    ...bookings,
    ...blocks.filter(b => b.is_booking),
  ]
    .filter(s => endOf(s) >= today)
    .filter(s => !prop || s.property_id === prop)
    .sort((a, b) => String(startOf(a)).localeCompare(String(startOf(b))))

  const pill = (active: boolean): React.CSSProperties => ({
    padding: '7px 13px', borderRadius: '99px', fontSize: '13px', fontFamily: F.sans, cursor: 'pointer',
    border: `1px solid ${active ? L.ink : 'oklch(0.89 0.005 80)'}`,
    background: active ? L.ink : '#fff', color: active ? '#fff' : L.ink,
    fontWeight: active ? 600 : 400, whiteSpace: 'nowrap',
  })

  return (
    <div style={{ paddingTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <span style={{ fontFamily: F.serif, fontSize: '30px', lineHeight: 1 }}>Stays</span>
        <span style={{ fontSize: '14px', color: L.inkBody }}>
          {stays.length === 0 ? 'Nothing upcoming.' : `${stays.length} upcoming, soonest first.`}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '7px', overflowX: 'auto', paddingBottom: '2px' }}>
        <button onClick={() => setProp('')} style={pill(!prop)}>All</button>
        {PROPERTIES.map(p => (
          <button key={p.id} onClick={() => setProp(p.id)} style={pill(prop === p.id)}>{p.short}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        {stays.map(s => {
          const c = platformColour(sourceOf(s))
          const here = startOf(s) <= today && endOf(s) > today
          const arrivesToday = startOf(s) === today
          const leavesToday = endOf(s) === today
          const src = sourceOf(s)
          return (
            <Link key={s.id} href={hrefFor(s)} style={{ ...cardStyle, padding: 0, textDecoration: 'none', color: L.ink, display: 'flex', overflow: 'hidden' }}>
              <span style={{ width: '4px', flex: 'none', background: c.bg }} />
              <span style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{guestName(s)}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: F.mono, fontSize: '10px', letterSpacing: '.08em', textTransform: 'uppercase', color: c.bg }}>
                    {src === 'vrbo' ? 'VRBO' : src}
                  </span>
                </span>
                <span style={{ fontSize: '13px', color: L.inkBody }}>
                  {NAME[s.property_id] || s.property_id} · {fmt(startOf(s))} → {fmt(endOf(s))}
                </span>
                <span style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {arrivesToday && (
                    <span style={{ fontFamily: F.mono, fontSize: '10px', letterSpacing: '.07em', color: L.green }}>
                      ARRIVES TODAY {getCheckInDisplay(s).time}
                    </span>
                  )}
                  {leavesToday && (
                    <span style={{ fontFamily: F.mono, fontSize: '10px', letterSpacing: '.07em', color: L.amber }}>
                      LEAVES TODAY {getCheckOutDisplay(s).time}
                    </span>
                  )}
                  {here && !arrivesToday && !leavesToday && (
                    <span style={{ fontFamily: F.mono, fontSize: '10px', letterSpacing: '.07em', color: L.inkFaint }}>IN RESIDENCE</span>
                  )}
                  {unpaid(s) && (
                    <span style={{ fontFamily: F.mono, fontSize: '10px', letterSpacing: '.07em', color: 'oklch(0.52 0.15 28)' }}>UNPAID</span>
                  )}
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
