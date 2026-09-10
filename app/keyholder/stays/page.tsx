import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { L, F, microLabel, cardStyle, money } from '@/lib/design-tokens'

export const dynamic = 'force-dynamic'

const PROPERTY_NAMES: Record<string, string> = {
  'nickel-beach': 'Nickel Beach',
  'royal-york-west': 'Royal York West',
  'royal-york-east': 'Royal York East',
}

/*  THE STAYS LIST — what /admin/bookings does, and one thing it never did.
 *
 *  This page was a twenty-line stub whose whole content was a calendar link and
 *  the sentence "Bookings, guests and parking are still on the legacy admin".
 *  That sentence was TRUE, which is why the link was left alone through eight
 *  other redirects: the retirement audit had this route down as migrated because
 *  a page existed at the path a migrated page would occupy. It wasn't migrated.
 *  There was no booking list in the new shell at all.
 *
 *  BOTH TABLES, ONE LIST. Direct bookings live in `bookings`, platform
 *  reservations in `calendar_blocks`, and a list that shows one and not the other
 *  is how a stay goes unnoticed. Same merge the calendar does.
 *
 *  is_booking IS THE FILTER, not night-count. calendar_blocks also holds
 *  turnover blocks and owner-held dates; a one-night row is not automatically a
 *  prep day and a prep day is not always one night. The flag says which is which.
 *
 *  STATUS IS DERIVED FROM TORONTO TIME, not from a stored column, because a stay
 *  becomes Active at 4pm and Completed at 11am — the same clock the door codes
 *  run on. A server in UTC would call a stay finished while the guest is still
 *  having breakfast. */

type Row = {
  id: string
  kind: 'direct' | 'platform'
  propertyId: string
  guest: string
  start: string
  end: string
  nights: number
  total: number
  platform: string
  ref: string | null
  needsFigures?: boolean
}

function torontoToday() {
  const now = new Date()
  return {
    date: now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }),
    time: now.toLocaleTimeString('en-GB', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hour12: false }),
  }
}

function stayStatus(start: string, end: string) {
  const { date, time } = torontoToday()
  if (end < date) return { label: 'Completed', tone: L.inkFaint }
  if (end === date && time >= '11:00') return { label: 'Completed', tone: L.inkFaint }
  if (start === date && time < '16:00') return { label: 'Arrives today', tone: L.amber }
  if (start <= date && end >= date) return { label: 'On site', tone: L.link }
  if (start === date) return { label: 'Arrives today', tone: L.amber }
  return { label: 'Upcoming', tone: L.ink }
}

const nightsBetween = (a: string, b: string) =>
  Math.max(1, Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000))

export default async function Stays({ searchParams }: {
  searchParams: Promise<{ property?: string; completed?: string }>
}) {
  const { property, completed } = await searchParams
  const showCompleted = completed === '1'

  const supabase = createAdminClient()
  const [{ data: direct }, { data: blocks }] = await Promise.all([
    supabase.from('bookings')
      .select('id, property_id, check_in, check_out, total, status, booking_reference, guest_info:guests(name)')
      .neq('status', 'cancelled').order('check_in'),
    supabase.from('calendar_blocks')
      .select('id, property_id, start_date, end_date, guest_name, platform, payout_amount, is_booking, ical_uid, confirmation_code, status')
      .neq('status', 'cancelled').order('start_date'),
  ])

  const rows: Row[] = [
    ...(direct || []).map(b => {
      const g = Array.isArray(b.guest_info) ? (b.guest_info as any[])[0] : (b.guest_info as any)
      return {
        id: b.id, kind: 'direct' as const, propertyId: b.property_id,
        guest: g?.name || 'Direct guest',
        start: b.check_in, end: b.check_out, nights: nightsBetween(b.check_in, b.check_out),
        total: Number(b.total) || 0, platform: 'direct', ref: b.booking_reference,
      }
    }),
    ...(blocks || []).filter(b => b.is_booking === true || !!b.ical_uid).map(b => ({
      id: b.id, kind: 'platform' as const, propertyId: b.property_id,
      guest: (b.guest_name || '').trim() || 'Unnamed booking',
      start: b.start_date, end: b.end_date, nights: nightsBetween(b.start_date, b.end_date),
      total: Number(b.payout_amount) || 0, platform: b.platform || 'platform', ref: b.confirmation_code,
      needsFigures: !b.is_booking,
    })),
  ]
    .filter(r => !property || r.propertyId === property)
    .filter(r => showCompleted || stayStatus(r.start, r.end).label !== 'Completed')
    .sort((a, b) => a.start.localeCompare(b.start))

  const chip = (label: string, href: string, on: boolean) => (
    <Link key={label} href={href} style={{
      padding: '7px 14px', borderRadius: '999px', textDecoration: 'none', fontSize: '13px',
      fontWeight: on ? 600 : 500,
      border: `1px solid ${on ? L.amberLine : L.line}`,
      background: on ? L.amberWash : L.card,
      color: on ? L.ink : L.inkBody,
    }}>{label}</Link>
  )
  const q = (p?: string, c?: boolean) => {
    const s = new URLSearchParams()
    if (p) s.set('property', p)
    if (c) s.set('completed', '1')
    const t = s.toString()
    return `/keyholder/stays${t ? '?' + t : ''}`
  }

  return (
    <div style={{ paddingTop: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px' }}>
        <span style={{ fontFamily: F.serif, fontSize: '36px', lineHeight: 1 }}>Stays</span>
        <Link href="/keyholder/stays/calendar" style={{ fontSize: '14px', fontWeight: 600, color: L.link, textDecoration: 'none' }}>Calendar →</Link>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {chip('All properties', q(undefined, showCompleted), !property)}
        {Object.entries(PROPERTY_NAMES).map(([id, name]) => chip(name, q(id, showCompleted), property === id))}
        <span style={{ flex: 1 }} />
        {chip(showCompleted ? 'Hiding nothing' : 'Show completed', q(property, !showCompleted), showCompleted)}
      </div>

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: '11px 22px', background: L.cardAlt, borderBottom: `1px solid ${L.lineSoft}` }}>
          <span style={microLabel}>
            {rows.length} {rows.length === 1 ? 'stay' : 'stays'}
            {showCompleted ? '' : ' · completed hidden'}
          </span>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '18px 22px', fontSize: '13px', color: L.inkMuted, lineHeight: 1.55 }}>
            Nothing here. {property ? 'Try another property, or ' : ''}
            {showCompleted ? 'there are no stays on record.' : 'completed stays are hidden — show them above.'}
          </div>
        ) : rows.map((r, i) => {
          const s = stayStatus(r.start, r.end)
          const href = r.kind === 'direct'
            ? `/keyholder/stays/booking/${r.id}`
            : `/keyholder/stays/block/${r.id}`
          return (
            <Link key={`${r.kind}-${r.id}`} href={href} style={{
              display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 22px',
              borderTop: i ? `1px solid ${L.lineFaint}` : 'none', textDecoration: 'none', flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '190px', flex: 1 }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: L.ink }}>{r.guest}</span>
                <span style={{ fontSize: '12px', color: L.inkMuted }}>
                  {PROPERTY_NAMES[r.propertyId] || r.propertyId} · {r.platform}
                  {r.ref ? ` · ${r.ref}` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '150px' }}>
                <span style={{ fontFamily: F.mono, fontSize: '13px', color: L.ink }}>{r.start} → {r.end}</span>
                <span style={{ fontSize: '12px', color: L.inkMuted }}>{r.nights} {r.nights === 1 ? 'night' : 'nights'}</span>
              </div>
              <span style={{ fontFamily: F.mono, fontSize: '13px', color: r.total ? L.ink : L.amber, minWidth: '92px', textAlign: 'right' }}>
                {r.total ? money(r.total) : 'needs figures'}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: s.tone, minWidth: '96px', textAlign: 'right' }}>{s.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
