import Link from 'next/link'
import { format } from 'date-fns'
import { createAdminClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/auth'
import { L, F, cardStyle, microLabel } from '@/lib/design-tokens'

/*  Every damage report, across stays. The cross-stay view; filing happens on
 *  the stay itself.
 *
 *  IT LIVES UNDER STAYS, NOT MONEY. The legacy page sat in the Money section of
 *  the admin rail, beside Income and Expenses, and that placement was the same
 *  mistake as putting the amount in the P&L: a claim is a dispute with a guest,
 *  not revenue. Nothing is earned when a report is filed and nothing is earned
 *  when it is approved. Money moves, if it moves at all, through the security
 *  deposit, and that control is on the stay.
 *
 *  NO EMBED. damage_reports.booking_id is text and bookings.id is uuid with no
 *  constraint between them, so PostgREST cannot join them — asking it to is
 *  what made the legacy page render "No damage reports" whatever was in the
 *  table. The stays are fetched by id and matched here. */

export const dynamic = 'force-dynamic'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach':    'Nickel Beach',
}
const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  pending:   { label: 'Pending',   fg: L.amber,    bg: L.amberWash },
  approved:  { label: 'Approved',  fg: L.red,      bg: L.redWash },
  fixed:     { label: 'Fixed',     fg: L.green,    bg: L.cardAlt },
  dismissed: { label: 'Dismissed', fg: L.inkFaint, bg: L.cardAlt },
}

export default async function StayDamagePage() {
  if (!await hasPermission('damage', 'view')) {
    return (
      <div style={{ ...cardStyle, padding: '40px', marginTop: '24px', textAlign: 'center', fontSize: '13.5px', color: L.inkFaint }}>
        Damage reports are not part of your access.
      </div>
    )
  }

  const supabase = createAdminClient()
  const { data: reports, error } = await supabase
    .from('damage_reports').select('*').order('logged_at', { ascending: false })

  const directIds = (reports || []).filter(r => r.booking_kind !== 'platform' && r.booking_id).map(r => r.booking_id)
  const blockIds  = (reports || []).filter(r => r.booking_kind === 'platform' && r.booking_id).map(r => r.booking_id)

  const [{ data: stays }, { data: blocks }, { data: media }] = await Promise.all([
    directIds.length
      ? supabase.from('bookings').select('id, check_in, guests(name)').in('id', directIds)
      : Promise.resolve({ data: [] as any[] }),
    blockIds.length
      ? supabase.from('calendar_blocks').select('id, start_date, guest_name, platform').in('id', blockIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('booking_media').select('report_id').not('report_id', 'is', null),
  ])

  const stayById: Record<string, { name: string; from: string | null; href: string }> = {}
  for (const s of stays || []) stayById[s.id] = { name: (s as any).guests?.name || '—', from: s.check_in, href: `/keyholder/stays/booking/${s.id}` }
  for (const b of blocks || []) stayById[b.id] = { name: b.guest_name || b.platform || '—', from: b.start_date, href: `/keyholder/stays/block/${b.id}` }

  const photoCount: Record<string, number> = {}
  for (const m of media || []) photoCount[m.report_id] = (photoCount[m.report_id] || 0) + 1

  const claimed = (reports || []).filter(r => r.status !== 'dismissed')
    .reduce((s, r) => s + (Number(r.amount_claimed) || 0), 0)
  const pending = (reports || []).filter(r => r.status === 'pending').length

  return (
    <div style={{ paddingTop: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px' }}>
        <span style={{ fontFamily: F.serif, fontSize: '36px', lineHeight: 1 }}>Damage</span>
        <Link href="/keyholder/stays" style={{ fontSize: '14px', fontWeight: 600, color: L.link, textDecoration: 'none' }}>← Stays</Link>
      </div>

      <div style={{ fontSize: '13.5px', color: L.inkMuted, lineHeight: 1.6, maxWidth: '640px' }}>
        A report is filed on the stay it belongs to — that page already knows the booking and already holds the
        photographs. Nothing here moves money; a claim against the deposit is settled on the stay.
      </div>

      {error && (
        <div style={{ ...cardStyle, padding: '14px 18px', fontSize: '13px', color: L.red, borderColor: L.redLine }}>
          The reports could not be read: {error.message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
        {[
          ['Reports', String(reports?.length || 0)],
          ['Still pending', String(pending)],
          ['Claimed, not dismissed', `$${claimed.toFixed(2)}`],
        ].map(([label, value]) => (
          <div key={label} style={{ ...cardStyle, padding: '14px 18px' }}>
            <div style={{ ...microLabel, marginBottom: '6px' }}>{label}</div>
            <div style={{ fontFamily: F.serif, fontSize: '26px', lineHeight: 1 }}>{value}</div>
          </div>
        ))}
      </div>

      {!reports?.length ? (
        <div style={{ ...cardStyle, padding: '40px', textAlign: 'center', fontSize: '13.5px', color: L.inkFaint, lineHeight: 1.7 }}>
          Nothing reported.<br />
          Open a stay and file it there — the photos are already on that page.
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          {reports.map((r, i) => {
            const stay = r.booking_id ? stayById[r.booking_id] : null
            const s = STATUS[r.status] || STATUS.pending
            const n = photoCount[r.id] || 0
            return (
              <div key={r.id} style={{ padding: '16px 22px', borderTop: i ? `1px solid ${L.lineSoft || L.line}` : 'none', display: 'grid', gridTemplateColumns: '1fr 120px', gap: '16px', alignItems: 'start' }}>
                <div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span style={{ fontSize: '14.5px', color: L.ink }}>{r.item}</span>
                    {r.room && <span style={{ fontSize: '12.5px', color: L.inkFaint }}>· {r.room}</span>}
                    <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '6px', background: s.bg, color: s.fg }}>{s.label}</span>
                    {r.linked_to_deposit && (
                      <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '6px', background: L.amberWash, color: L.amber }}>Deposit</span>
                    )}
                    <span style={{ fontSize: '11.5px', color: n ? L.inkMuted : L.inkFaint }}>
                      {n ? `${n} photo${n === 1 ? '' : 's'}` : 'no photos'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: L.inkFaint }}>
                    {PROPERTY_NAMES[r.property_id] || r.property_id}
                    {stay && ` · ${stay.name}${stay.from ? ` · ${format(new Date(stay.from + 'T12:00:00'), 'MMM d, yyyy')}` : ''}`}
                    {r.logged_at && ` · logged ${format(new Date(r.logged_at), 'MMM d')}`}
                    {r.logged_by && ` by ${r.logged_by}`}
                  </div>
                  {r.description && (
                    <div style={{ fontSize: '12.5px', color: L.inkMuted, marginTop: '5px', lineHeight: 1.5 }}>{r.description}</div>
                  )}
                  <div style={{ marginTop: '6px' }}>
                    {stay
                      ? <Link href={stay.href} style={{ fontSize: '12.5px', fontWeight: 600, color: L.link, textDecoration: 'none' }}>Open the stay →</Link>
                      : <span style={{ fontSize: '12.5px', color: L.inkFaint }}>No stay attached</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...microLabel, marginBottom: '3px' }}>Claimed</div>
                  <div style={{ fontFamily: F.mono, fontSize: '17px', color: r.amount_claimed ? L.red : L.inkFaint }}>
                    {r.amount_claimed ? `$${Number(r.amount_claimed).toFixed(2)}` : '—'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
