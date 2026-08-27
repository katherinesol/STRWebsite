import Link from 'next/link'
import { format } from 'date-fns'
import { L, F, microLabel, cardStyle, money, platformColour } from '@/lib/design-tokens'
import { getCheckInDisplay, getCheckOutDisplay } from '@/lib/checkin-times'
import { unpaid, paidSoFar, outstanding } from '@/lib/keyholder/payment'
import DoorCodeField from './DoorCodeField'
import GrantsField from './GrantsField'
import { ConfirmationCodeField } from './BookingControls'
import FiguresPanel from './FiguresPanel'
import GiftCard from '@/components/admin/GiftCard'
import CoGuests from '@/components/keyholder/CoGuests'
import StayChecklist from '@/components/admin/StayChecklist'
import ParkingControl from '@/components/admin/ParkingControl'
import CompToggle from '@/components/keyholder/CompToggle'
import CancelOrRefund from '@/components/keyholder/CancelOrRefund'

/** Design-doc 2a, read only.
 *
 *  The doc draws this for Jerry Wei, who is an Airbnb booking — so the Payment
 *  section as drawn is the PLATFORM one: payout, host service fee, a tax note.
 *  A direct booking has no payout and no commission; it has an instalment
 *  schedule with its own due dates. Same page, two Payment panels.
 *
 *  DOORS, THIS STAY is drawn in the doc as an event log — "Royal Side opened
 *  with Jerry's code, 4:07 PM". There is no lock_events table and no
 *  activity_log in this database; those events live in Seam and would need a
 *  live per-lock call. Rather than draw an empty box or invent plausible rows,
 *  the Access card says what is actually known — which locks the property has,
 *  whether a code is set, what the last sweep recorded — and names what is
 *  missing. */

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach': 'Nickel Beach',
}
const day = (d: string) => new Date(d + 'T12:00:00')
const dshort = (d: string) => format(day(d), 'EEE, MMM d')

type Props = {
  kind: 'direct' | 'platform'
  b: any
  accounts?: any[]
  locks: any[]
  guest: any | null
  conversation: any | null
  messages: any[]
  hasGift: boolean
}

export default function BookingDetail({ kind, b, locks, guest, conversation, messages, hasGift, accounts }: Props) {
  const isDirect = kind === 'direct'
  const from = isDirect ? b.check_in : b.start_date
  const to = isDirect ? b.check_out : b.end_date
  const name = isDirect ? (guest?.name || '—') : (b.guest_name || b.platform || '—')
  /*  Reversing a booking lives beside the money it reverses, not in a menu.
      Cancelled stays keep the control hidden — the endpoint refuses a second
      cancellation, and offering a button that always errors is worse than not
      offering it. */
  const cancelControl = b.status === 'cancelled' ? null : (
    <CancelOrRefund bookingId={b.id} kind={kind} guest={name} accounts={accounts || []} />
  )
  const source = isDirect ? 'direct' : (b.platform || 'manual')
  const colour = platformColour(source)
  const nights = from && to
    ? Math.max(1, Math.round((day(to).getTime() - day(from).getTime()) / 86400000))
    : (b.nights || 0)

  const inT = getCheckInDisplay(b), outT = getCheckOutDisplay(b)
  const code = String(b.door_code || b.lock_code || '').trim()
  /* lock_status is the morning sweep's verdict, written by the cron: a doors[]
     array of { lock, code, status, scheduled } plus needs_attention. A code
     typed onto the booking is not the same thing as a code that reached the
     device, and this is the only place that distinction is visible. */
  const ls = b.lock_status && typeof b.lock_status === 'object' ? b.lock_status : null
  const sweep: any[] = Array.isArray(ls?.doors) ? ls.doors : []
  const owing = isDirect ? outstanding(b) : 0
  const isUnpaid = isDirect && unpaid(b)

  const stat = (label: string, value: React.ReactNode, sub?: string, tone?: string) => (
    <div style={{ ...cardStyle, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <span style={microLabel}>{label}</span>
      <span style={{ fontSize: '17px', fontWeight: 600, color: tone || L.ink }}>{value}</span>
      {sub && <span style={{ fontSize: '12px', color: L.inkMuted }}>{sub}</span>}
    </div>
  )
  const rowS: React.CSSProperties = { display: 'flex', alignItems: 'baseline', gap: '12px', fontSize: '13px', padding: '11px 0' }
  const sectionHead = (t: string, note?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
      <span style={{ fontSize: '15px', fontWeight: 600 }}>{t}</span>
      {note && <span style={{ marginLeft: 'auto', fontSize: '13px', color: L.inkMuted }}>{note}</span>}
    </div>
  )

  return (
    <div style={{ paddingTop: '30px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
          <Link href="/keyholder/stays/calendar" style={{ fontSize: '13px', color: L.inkMuted, textDecoration: 'none' }}>
            ← Stays · {PROPERTY_NAMES[b.property_id] || b.property_id}
          </Link>
          <span style={{ fontFamily: F.serif, fontSize: '40px', lineHeight: 1 }}>{name}</span>
          <span style={{ fontSize: '15px', color: L.inkBody }}>
            {from ? dshort(from) : '—'} – {to ? dshort(to) : '—'} · {nights} night{nights === 1 ? '' : 's'} ·{' '}
            <span style={{ color: colour.bg, fontWeight: 600 }}>{source}</span> ·{' '}
            arrives {inT.time}, leaves {outT.time}
          </span>
        </div>
        <span style={{
          marginLeft: 'auto', padding: '8px 14px', borderRadius: '99px', fontSize: '13px', fontWeight: 600,
          background: isUnpaid ? L.redWash : 'oklch(0.94 0.05 155)',
          color: isUnpaid ? L.red : 'oklch(0.38 0.10 155)',
          border: `1px solid ${isUnpaid ? L.redLine : 'transparent'}`,
        }}>
          {isDirect ? (isUnpaid ? `Owing ${money(owing)}` : 'Paid in full') : 'Collected by the platform'}
        </span>
      </div>

      {/* stat strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        {stat('Status', b.status || (isDirect ? '—' : 'confirmed'))}
        {isDirect
          ? stat('Received', money(paidSoFar(b)), b.total ? `of ${money(b.total)}` : 'no total recorded', b.total ? undefined : L.red)
          : stat('Your payout', money(b.payout_amount), b.commission ? `after ${money(b.commission)} host fee` : undefined)}
        {stat('Door code', code || 'Not set', code ? undefined : 'guest cannot get in', code ? undefined : L.red)}
        {stat('Guest', hasGift ? '🎁 gift prepared' : (guest?.returning_guest ? 'Returning' : 'First stay'),
          guest?.id_verified ? 'ID verified' : 'not ID-verified')}
      </div>

      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1.35, display: 'flex', flexDirection: 'column', gap: '26px', minWidth: 0 }}>

          {/* access */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sectionHead('Access', code ? undefined : <span style={{ color: L.red }}>Needs a code before {inT.time}</span>)}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, locks.length)}, 1fr)`, gap: '12px' }}>
              {locks.length === 0 ? (
                <div style={{ ...cardStyle, padding: '16px 18px', fontSize: '13px', color: L.inkMuted }}>
                  No locks recorded for this property.
                </div>
              ) : locks.map(l => {
                const managed = l.airbnb_managed && source === 'airbnb'
                const swept = sweep.find((d: any) => d.lock === l.lock_name)
                const onDevice = swept ? (swept.status === 'set' || swept.scheduled) : null
                return (
                  <div key={l.id} style={{
                    ...cardStyle, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '7px',
                    border: `1px solid ${managed ? L.line : onDevice === false || !code ? L.redLine : L.line}`,
                  }}>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>{l.lock_name}</span>
                    <span style={{ fontFamily: F.mono, fontSize: '20px', letterSpacing: '0.28em', color: code ? L.ink : L.inkFaint }}>
                      {managed ? '— — — —' : (code || '· · · ·')}
                    </span>
                    <span style={{ fontSize: '12px', color: managed ? L.inkMuted : onDevice === false ? L.red : onDevice ? L.green : L.inkMuted }}>
                      {managed ? 'Airbnb manages this lock'
                        : onDevice === false ? 'on the booking, NOT on the lock'
                        : onDevice ? 'confirmed on the lock'
                        : code ? 'on the booking, never swept' : 'missing'}
                    </span>
                  </div>
                )
              })}
            </div>
            <div style={{ ...cardStyle, padding: '18px 20px' }}>
              <DoorCodeField bookingId={b.id} kind={kind} current={code || null}
                guestPhone={(isDirect ? guest?.phone : b.guest_phone) || null} />
            </div>
            <div style={{ ...cardStyle, padding: '18px 20px' }}>
              <GrantsField bookingId={b.id} kind={kind}
                earlyGranted={!!b.early_checkin_granted} lateGranted={!!b.late_checkout_granted}
                earlyTime={b.early_checkin_time} lateTime={b.late_checkout_time} />
            </div>
            <span style={{ fontSize: '12px', color: L.inkFaint, lineHeight: 1.5 }}>
              {ls?.checked_at
                ? <>Last swept {format(new Date(ls.checked_at), 'MMM d, h:mm a')}.{' '}
                    {ls.needs_attention
                      ? <span style={{ color: L.red }}>The sweep could not confirm every code on its device.</span>
                      : 'Every code confirmed on its device.'}</>
                : 'Never swept. This shows what the booking records, not what is on the device.'}
              {' '}There is no per-stay door event log — those events live in Seam.
            </span>
          </div>

          {/* payment — two different panels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sectionHead('Payment', isDirect ? 'instalments' : `${source} settles with you`)}
            <div style={{ ...cardStyle, padding: '4px 20px' }}>
              {isDirect ? (
                /* A COMPED STAY IS NOT AN UNPRICED ONE. Checked before the
                   no-figures branch, because a free stay would otherwise be told
                   to add figures it will never have. */
                b.is_comp ? (
                  <div style={{ padding: '18px 0', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '14px', color: L.ink, fontWeight: 600 }}>Free stay.</span>
                    <span style={{ fontSize: '13px', color: L.inkBody }}>
                      No payment expected — nothing will chase {name} for money.
                    </span>
                  </div>
                ) : b.total == null || Number(b.total) === 0 ? (
                  <div style={{ padding: '18px 0', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '14px', color: L.red, fontWeight: 600 }}>No figures on this booking.</span>
                    <span style={{ fontSize: '13px', color: L.inkBody }}>
                      Nobody can tell whether {name} has paid until the room subtotal is recorded.
                    </span>
                    <div style={{ marginTop: '8px' }}>
                      <FiguresPanel bookingId={b.id} guestName={name}
                        current={{ accommodation: b.accommodation, cleaning_fee: b.cleaning_fee, addon_fee: b.addon_fee, hst: b.hst, mat: b.mat, total: b.total }} />
                    </div>
                    <CompToggle bookingId={b.id} isComp={!!b.is_comp} guestName={name} />
                    <div style={{ marginTop: '10px' }}>{cancelControl}</div>
                  </div>
                ) : <>
                  {([['Deposit', b.deposit_amount, b.deposit_paid_at, null],
                     ['Second', b.second_payment_amount, b.second_paid_at, b.second_due_date],
                     ['Final', b.final_payment_amount, b.final_paid_at, b.final_due_date]] as const)
                    .filter(([, amt]) => amt != null && Number(amt) > 0)
                    .map(([label, amt, paid, due]) => (
                      <div key={label} style={{ ...rowS, borderBottom: `1px solid ${L.lineFaint}` }}>
                        <span style={{ color: L.inkMuted, width: '90px' }}>{label}</span>
                        <span style={{ fontFamily: F.mono }}>{money(amt)}</span>
                        <span style={{ marginLeft: 'auto', color: paid ? L.green : (due && due < format(new Date(), 'yyyy-MM-dd') ? L.red : L.inkMuted) }}>
                          {paid ? `paid ${format(new Date(paid), 'MMM d')}` : due ? `due ${format(day(due), 'MMM d')}` : 'not scheduled'}
                        </span>
                      </div>
                    ))}
                  <div style={{ padding: '12px 0' }}>
                    <FiguresPanel bookingId={b.id} guestName={name}
                      current={{ accommodation: b.accommodation, cleaning_fee: b.cleaning_fee, addon_fee: b.addon_fee, hst: b.hst, mat: b.mat, total: b.total }} />
                  </div>
                  <div style={{ ...rowS, fontSize: '14px' }}>
                    <span style={{ width: '90px', fontWeight: 600 }}>Outstanding</span>
                    <span style={{ marginLeft: 'auto', fontFamily: F.mono, fontWeight: 600, color: owing > 0.005 ? L.red : L.green }}>
                      {money(owing)}
                    </span>
                  </div>
                  <CompToggle bookingId={b.id} isComp={!!b.is_comp} guestName={name} />
                    <div style={{ marginTop: '10px' }}>{cancelControl}</div>
                </>
              ) : <>
                {([['Accommodation', b.accommodation], ['Cleaning', b.cleaning_fee], ['Extras', b.extras],
                   ['Discount', b.discount], ['Host service fee', b.commission], ['Processing fee', b.payment_processing_fee]] as const)
                  .filter(([, v]) => v != null && Number(v) !== 0)
                  .map(([label, v]) => (
                    <div key={label} style={{ ...rowS, borderBottom: `1px solid ${L.lineFaint}` }}>
                      <span style={{ color: L.inkMuted }}>{label}</span>
                      <span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(v)}</span>
                    </div>
                  ))}
                <div style={{ ...rowS, fontSize: '14px' }}>
                  <span style={{ fontWeight: 600 }}>Payout</span>
                  <span style={{ marginLeft: 'auto', fontFamily: F.mono, fontWeight: 600 }}>{money(b.payout_amount)}</span>
                </div>
              </>}
            </div>

            {/* tax — read only on both, and the slot the held toggle lands in */}
            <div style={{ ...cardStyle, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <span style={microLabel}>Tax</span>
                <span style={{ marginLeft: 'auto', fontSize: '12px', fontFamily: F.mono, color: b.apply_tax ? L.green : L.inkMuted }}>
                  apply_tax {String(!!b.apply_tax)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', fontSize: '13px' }}>
                <span><span style={{ color: L.inkMuted }}>HST </span><span style={{ fontFamily: F.mono }}>{money(b.hst)}</span></span>
                <span><span style={{ color: L.inkMuted }}>MAT </span><span style={{ fontFamily: F.mono }}>{money(b.mat)}</span></span>
                {!isDirect && <>
                  <span><span style={{ color: L.inkMuted }}>collected </span><span style={{ fontFamily: F.mono }}>{money(b.taxes_collected)}</span></span>
                  <span><span style={{ color: L.inkMuted }}>you remit </span><span style={{ fontFamily: F.mono }}>{money(b.taxes_you_remit)}</span></span>
                  <span><span style={{ color: L.inkMuted }}>platform remits </span><span style={{ fontFamily: F.mono }}>{money(b.taxes_platform_remits)}</span></span>
                </>}
              </div>
              <span style={{ fontSize: '12px', color: L.inkFaint, lineHeight: 1.5 }}>
                Read only. Editable once the VRBO/Airbnb audit settles what each platform actually remits.
              </span>
            </div>
          </div>

          {/* ported controls. GiftCard, StayChecklist and ParkingControl are
              MOUNTED UNCHANGED, not reimplemented — GiftCard in particular earns
              its keep by never loading the note text, and rewriting it to match
              the palette is how that guarantee gets lost. They still wear the
              legacy dark styling; restyling them is a follow-up that must not
              touch their behaviour. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sectionHead('Support & access codes')}
            <div style={{ ...cardStyle, padding: '18px 20px' }}>
              <ConfirmationCodeField bookingId={b.id} kind={kind} current={b.confirmation_code || null} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sectionHead('Parking', 'legacy styling — behaviour unchanged')}
            <ParkingControl bookingId={b.id} bookingKind={kind} propertyId={b.property_id}
              guestName={name} startDate={from} endDate={to} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sectionHead('Checklist', 'legacy styling — behaviour unchanged')}
            <StayChecklist propertyId={b.property_id} bookingId={b.id} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sectionHead('Who is on this stay', 'everyone here can be given a door code')}
            <CoGuests bookingId={b.id} kind={kind} />

            {sectionHead('Gift', 'never shown to the guest')}
            <GiftCard bookingId={b.id} bookingKind={kind} />
          </div>
        </div>

        {/* rail */}
        <div className="kh-rail" style={{ width: '392px', flex: 'none', ...cardStyle, borderRadius: '18px', padding: '26px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
              <span style={{ width: '46px', height: '46px', borderRadius: '50%', background: 'oklch(0.90 0.03 78)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 600 }}>
                {name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || '—'}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600 }}>{name}</span>
                <span style={{ fontSize: '13px', color: L.inkMuted }}>
                  {source}{guest?.id_verified ? ' · verified' : ''}{guest?.returning_guest ? ' · returning' : ''}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              {([['Email', guest?.email || b.guest_email], ['Phone', guest?.phone || b.guest_phone],
                 ['Party', b.guests ? `${b.guests} guest${b.guests === 1 ? '' : 's'}` : null],
                 ['Confirmation', b.confirmation_code]] as const)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} style={{ display: 'flex' }}>
                    <span style={{ color: L.inkMuted, width: '110px' }}>{k}</span><span>{v}</span>
                  </div>
                ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: `1px solid ${L.lineSoft}`, paddingTop: '22px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>Messages</span>
            {messages.length === 0 ? (
              <span style={{ fontSize: '13px', color: L.inkMuted, lineHeight: 1.55 }}>
                {conversation ? 'Thread open, nothing in it yet.' : 'No thread linked to this booking.'}
              </span>
            ) : messages.map(m => (
              <div key={m.id} style={{
                alignSelf: m.direction === 'outbound' ? 'flex-end' : 'flex-start', maxWidth: '88%',
                background: m.direction === 'outbound' ? L.ink : 'oklch(0.965 0.005 85)',
                color: m.direction === 'outbound' ? L.onInk : L.ink,
                borderRadius: m.direction === 'outbound' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '5px',
              }}>
                <span style={{ fontSize: '13px', lineHeight: 1.5 }}>{m.body}</span>
                <span style={{ fontFamily: F.mono, fontSize: '10px', opacity: 0.7 }}>
                  {m.created_at ? format(new Date(m.created_at), 'MMM d, h:mm a').toUpperCase() : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <span style={{ fontSize: '12px', color: L.inkFaint }}>
        Read only for now — editing, the checklist, grants and the gift card arrive next.{' '}
        <Link href={isDirect ? `/admin/bookings/${b.id}` : `/admin/bookings/block/${b.id}`} style={{ color: L.link, fontWeight: 600 }}>
          Open the old page
        </Link>
      </span>
    </div>
  )
}
