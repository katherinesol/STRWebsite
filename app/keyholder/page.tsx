import Link from 'next/link'
import { format, addDays } from 'date-fns'
import { createAdminClient } from '@/lib/supabase/server'
import { getAuth } from '@/lib/auth'
import { unpaid, outstanding, PAYMENT_COLUMNS } from '@/lib/keyholder/payment'
import { readEnvironment } from '@/lib/keyholder/today-env'
import { formatTripPurpose, tripPurposeIcon, GIFT_ICON } from '@/lib/trip-purposes'
import { L, F, microLabel, cardStyle, money, platformColour } from '@/lib/design-tokens'

export const dynamic = 'force-dynamic'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach': 'Nickel Beach',
}
const PLATFORMS = ['airbnb', 'vrbo', 'houfy']

/* Dates arrive as bare YYYY-MM-DD. `new Date('2026-08-20')` is UTC midnight,
   which in Toronto is 8pm on the 19th — the legacy dashboard prints the wrong
   day on two of its four cards because of exactly this. Noon has no such edge. */
const day = (d: string) => new Date(d + 'T12:00:00')
const short = (d: string) => format(day(d), 'MMM d')

export default async function Today() {
  const supabase = createAdminClient()
  const auth = await getAuth()
  const first = (auth.ok && auth.name) ? auth.name.split(' ')[0] : ''

  const now = new Date()
  const hour = Number(now.toLocaleString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', hour12: false }))
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const todayStr = format(now, 'yyyy-MM-dd')
  const weekStr = format(addDays(now, 7), 'yyyy-MM-dd')
  const soonStr = format(addDays(now, 3), 'yyyy-MM-dd')

  /* One round trip. is_booking and platform filtering happen in the query, not
     in JavaScript afterwards — the legacy page pulls every block with select('*')
     and throws most of them away on the client side. */
  const [
    { data: direct }, { data: platform }, { data: etransfers }, env,
  ] = await Promise.all([
    supabase.from('bookings')
      .select(`id, property_id, check_in, check_out, nights, status, payment_method, trip_purpose, trip_purpose_note,
               second_due_date, final_due_date, ${PAYMENT_COLUMNS}, guest_info:guests(name)`)
      .in('status', ['confirmed', 'active', 'pending_payment'])
      .neq('status', 'cancelled')
      .or(`and(check_out.gte.${todayStr},check_in.lte.${weekStr}),second_due_date.lt.${todayStr},final_due_date.lt.${todayStr}`)
      .order('check_in'),
    supabase.from('calendar_blocks')
      .select('id, property_id, platform, start_date, end_date, guest_name, door_code, trip_purpose, trip_purpose_note')
      .eq('is_booking', true).in('platform', PLATFORMS)
      .gte('end_date', todayStr).lte('start_date', weekStr)
      .order('start_date'),
    supabase.from('bookings')
      .select('id, property_id, check_in, deposit_amount, guest_info:guests(name)')
      .eq('status', 'pending_payment').eq('payment_method', 'etransfer'),
    readEnvironment(),
  ])

  const D = direct || [], P = platform || [], E = etransfers || []

  /* Gifts: booking_id ONLY. The note text never enters this page's data, so it
     cannot leak onto a screen a guest might be looking over your shoulder at. */
  const ids = [...D.map(b => b.id), ...P.map(b => b.id)]
  let gifts = new Set<string>()
  if (ids.length) {
    const { data } = await supabase.from('booking_gifts').select('booking_id').in('booking_id', ids).not('note', 'is', null)
    gifts = new Set((data || []).map(g => g.booking_id))
  }

  const guestName = (b: any) => (Array.isArray(b.guest_info) ? b.guest_info[0] : b.guest_info)?.name || '—'
  type Stay = { id: string; name: string; property: string; from: string; to: string; kind: string; href: string; purpose?: string | null; note?: string | null; gift: boolean; owes?: number }

  const stays: Stay[] = [
    ...D.filter(b => b.check_in && b.check_out && b.check_out >= todayStr && b.check_in <= weekStr).map(b => ({
      id: b.id, name: guestName(b), property: b.property_id, from: b.check_in, to: b.check_out,
      kind: 'direct', href: `/admin/bookings/${b.id}`, purpose: b.trip_purpose, note: b.trip_purpose_note,
      gift: gifts.has(b.id), owes: unpaid(b) ? outstanding(b) : 0,
    })),
    ...P.map(b => ({
      id: b.id, name: b.guest_name || b.platform, property: b.property_id, from: b.start_date, to: b.end_date,
      kind: b.platform || 'manual', href: `/admin/bookings/block/${b.id}`, purpose: b.trip_purpose, note: b.trip_purpose_note,
      gift: gifts.has(b.id), owes: 0,
    })),
  ]

  const arriving = stays.filter(s => s.from === todayStr)
  const leaving = stays.filter(s => s.to === todayStr)
  const inResidence = stays.filter(s => s.from < todayStr && s.to > todayStr)

  /* OVERDUE, paid-aware. The legacy card asks only whether a due date has passed
     and so counts money you have already banked — it is showing three today, one
     of which settled in June. An instalment is overdue when its date has passed
     AND it has no paid_at, and the booking still owes something overall. */
  const overdue = D.filter(b => unpaid(b) && (
    (b.second_due_date && b.second_due_date < todayStr && !b.second_paid_at) ||
    (b.final_due_date && b.final_due_date < todayStr && !b.final_paid_at)
  ))

  /* Two of the three direct bookings carry total = $0.00, so the paid-aware rule
     above cannot see them at all: unpaid() requires a total to compare against.
     Left alone, this page would cheerfully say "nothing needs you" while a guest
     owed thousands. A booking with a stay but no money on it is its own problem
     and gets said out loud rather than being silently skipped. */
  const noTotal = D.filter(b => b.check_in && !(Number(b.total) > 0))

  /* Arrivals inside 72h with nothing in door_code. This is the same signal the
     morning cron reports as "no code on booking" — it does not reach out to the
     locks, because a page view must never touch a device. */
  const noCode = P.filter(b => b.start_date >= todayStr && b.start_date <= soonStr && !String(b.door_code || '').trim())

  const needs = [
    ...noTotal.map(b => ({ key: 't' + b.id, tone: L.red, text: `${guestName(b)}'s booking has no total on it, so nobody can tell whether they have paid.`, meta: `${PROPERTY_NAMES[b.property_id]} · ${short(b.check_in)} – ${short(b.check_out)}`, href: `/admin/bookings/${b.id}`, cta: 'Add the figures' })),
    ...noCode.map(b => ({ key: 'k' + b.id, tone: L.red, text: `${b.guest_name || 'A guest'} arrives ${short(b.start_date)} at ${PROPERTY_NAMES[b.property_id]} and no door code is set.`, meta: 'They would be standing outside', href: `/admin/bookings/block/${b.id}`, cta: 'Set code' })),
    ...overdue.map(b => ({ key: 'o' + b.id, tone: L.red, text: `${guestName(b)} still owes ${money(outstanding(b))}.`, meta: `${PROPERTY_NAMES[b.property_id]} · stayed ${short(b.check_in)}`, href: `/admin/bookings/${b.id}`, cta: 'Chase it' })),
    ...E.map(b => ({ key: 'e' + b.id, tone: L.gold, text: `${guestName(b)}'s e-transfer of ${money(b.deposit_amount)} hasn't landed.`, meta: `${PROPERTY_NAMES[b.property_id]} · arrives ${b.check_in ? short(b.check_in) : '—'}`, href: `/admin/bookings/${b.id}`, cta: 'Open' })),
  ]

  const week = stays
    .flatMap(s => [
      ...(s.from >= todayStr && s.from <= weekStr ? [{ ...s, when: s.from, verb: 'arrives' }] : []),
      ...(s.to >= todayStr && s.to <= weekStr ? [{ ...s, when: s.to, verb: 'leaves' }] : []),
    ])
    .sort((a, b) => a.when.localeCompare(b.when) || a.verb.localeCompare(b.verb))

  const { cistern, airing, tub } = env as any
  const section: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '12px' }

  return (
    <div style={{ paddingTop: '40px', display: 'flex', flexDirection: 'column', gap: '32px' }}>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={microLabel}>{format(now, 'EEEE, MMMM d')} · Toronto</span>
        <span style={{ fontFamily: F.serif, fontSize: '42px', lineHeight: 1.05 }}>
          Good {greeting}{first ? `, ${first}` : ''}.
        </span>
      </div>

      {/* ───────── today ───────── */}
      <div style={section}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600 }}>Today</span>
          <span style={{ fontSize: '14px', color: L.inkFaint }}>
            {arriving.length + leaving.length === 0 ? 'nobody moving' : `${arriving.length} in, ${leaving.length} out`}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {([['Arriving', arriving], ['Leaving', leaving], ['In residence', inResidence]] as const).map(([label, list]) => (
            <div key={label} style={{ ...cardStyle, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '132px' }}>
              <span style={microLabel}>{label}</span>
              {list.length === 0
                ? <span style={{ fontSize: '14px', color: L.inkFaint }}>Nobody</span>
                : list.map(s => (
                  <Link key={s.id} href={s.href} style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: L.ink }}>
                    <span style={{ width: '4px', alignSelf: 'stretch', minHeight: '30px', borderRadius: '99px', background: platformColour(s.kind).bg, flex: 'none' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name}{s.gift ? ` ${GIFT_ICON}` : ''}
                      </span>
                      <span style={{ fontSize: '12px', color: L.inkMuted }}>
                        {PROPERTY_NAMES[s.property]}{s.purpose ? ` · ${tripPurposeIcon(s.purpose)} ${formatTripPurpose(s.purpose, s.note)}` : ''}
                      </span>
                    </div>
                    {s.owes ? <span style={{ marginLeft: 'auto', fontFamily: F.mono, fontSize: '11px', color: L.red }}>OWES</span> : null}
                  </Link>
                ))}
            </div>
          ))}
        </div>
      </div>

      {/* ───────── needs you ───────── */}
      <div style={section}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600 }}>Needs you</span>
          <span style={{ fontSize: '14px', color: L.inkFaint }}>{needs.length || 'nothing'}</span>
        </div>
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          {needs.length === 0 ? (
            <div style={{ padding: '28px 22px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={{ fontFamily: F.serif, fontSize: '23px' }}>Nothing needs you.</span>
              <span style={{ fontSize: '14px', color: L.inkBody }}>Every arrival has a code and nobody owes you money.</span>
            </div>
          ) : needs.map((n, i) => (
            <Link key={n.key} href={n.href} style={{
              display: 'flex', alignItems: 'center', gap: '16px', padding: '17px 22px', textDecoration: 'none', color: L.ink,
              borderTop: i ? `1px solid ${L.lineFaint}` : 'none',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: n.tone, flex: 'none' }} />
              <span style={{ fontSize: '15px' }}>{n.text}</span>
              <span style={{ fontSize: '13px', color: L.inkMuted }}>{n.meta}</span>
              <span style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: 600, color: L.link, flex: 'none' }}>{n.cta}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ───────── the week ───────── */}
      <div style={section}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600 }}>The week</span>
          <span style={{ fontSize: '14px', color: L.inkFaint }}>{short(todayStr)} – {short(weekStr)}</span>
          <Link href="/keyholder/stays/calendar" style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 600, color: L.link, textDecoration: 'none' }}>Open the calendar →</Link>
        </div>
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          {week.length === 0 ? (
            <div style={{ padding: '20px 22px', fontSize: '14px', color: L.inkFaint }}>Nothing moves this week.</div>
          ) : week.map((s, i) => (
            <Link key={`${s.id}-${s.verb}`} href={s.href} style={{
              display: 'grid', gridTemplateColumns: '74px 1fr 1.1fr 88px', alignItems: 'center', gap: '14px',
              padding: '13px 22px', textDecoration: 'none', color: L.ink,
              borderTop: i ? `1px solid ${L.lineFaint}` : 'none',
              background: s.when === todayStr ? L.cardAlt : 'transparent',
            }}>
              <span style={{ ...microLabel, color: s.when === todayStr ? L.ink : L.inkFaint }}>
                {s.when === todayStr ? 'TODAY' : format(day(s.when), 'EEE d').toUpperCase()}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '3px', background: platformColour(s.kind).bg, flex: 'none' }} />
                <span style={{ fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.name}{s.gift ? ` ${GIFT_ICON}` : ''}
                </span>
              </span>
              <span style={{ fontSize: '13px', color: L.inkBody }}>{PROPERTY_NAMES[s.property]}</span>
              <span style={{ fontSize: '13px', color: s.verb === 'arrives' ? L.green : L.inkMuted, textAlign: 'right' }}>{s.verb}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ───────── properties ───────── */}
      <div style={section}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600 }}>The properties</span>
          <span style={{ fontSize: '14px', color: L.inkFaint }}>read when the page loaded</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          <div style={{ ...cardStyle, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={microLabel}>Cistern · Nickel Beach</span>
            <span style={{ fontFamily: F.serif, fontSize: '30px', lineHeight: 1.1, color: cistern && cistern.percent <= 30 ? L.red : L.ink }}>
              {cistern?.percent != null ? `${cistern.percent}%` : '—'}
            </span>
            <span style={{ fontSize: '13px', color: L.inkMuted }}>
              {cistern?.percent == null ? 'Reading unavailable'
                : cistern.percent <= 30 ? 'At or below reorder level' : 'Above reorder level'}
            </span>
          </div>
          <div style={{ ...cardStyle, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={microLabel}>Window airing · Royal York</span>
            <span style={{ fontFamily: F.serif, fontSize: '30px', lineHeight: 1.1 }}>{airing?.state || '—'}</span>
            <span style={{ fontSize: '13px', color: L.inkMuted, lineHeight: 1.45 }}>{airing?.reason || 'Weather unavailable'}</span>
          </div>
          <div style={{ ...cardStyle, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={microLabel}>Hot tub wind · Nickel Beach</span>
            <span style={{ fontFamily: F.serif, fontSize: '30px', lineHeight: 1.1, color: tub?.status === 'HIGH' ? L.red : L.ink }}>
              {tub?.label || '—'}
            </span>
            <span style={{ fontSize: '13px', color: L.inkMuted, lineHeight: 1.45 }}>{tub?.reason || 'Weather unavailable'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
