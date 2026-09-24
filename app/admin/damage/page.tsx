import { createAdminClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/auth'
import { format } from 'date-fns'
import Link from 'next/link'

/*  Every damage report, across stays and properties. READ ONLY.
 *
 *  FILING MOVED. A report is made on the stay it belongs to
 *  (/keyholder/stays/booking/[id]) because that is the page that already knows
 *  which booking it is and already holds the photographs the claim rests on.
 *  /admin/damage/new asked you to find the stay again in a dropdown of every
 *  booking there is, and then failed to save whatever you chose.
 *
 *  THIS PAGE WAS ALSO READING COLUMNS THAT DO NOT EXIST — r.item, r.location,
 *  r.amount_claimed — and embedding bookings() across a text/uuid pair with no
 *  foreign key between them, which makes PostgREST return an error and the page
 *  render "No damage reports". Both halves of the feature agreed there was
 *  nothing here, for different wrong reasons.
 *
 *  THE PERMISSION IS CHECKED HERE. The admin layout only asks whether you are
 *  signed in, so this page was visible to a cleaner. Damage is an area in the
 *  permission map and this is the page that shows it. */

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach':    'Nickel Beach',
}
const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  pending:   { label: 'Pending',   fg: '#f39c12', bg: '#2a1f0a' },
  approved:  { label: 'Approved',  fg: '#e74c3c', bg: '#2a1212' },
  fixed:     { label: 'Fixed',     fg: '#7bc47b', bg: '#152015' },
  dismissed: { label: 'Dismissed', fg: '#8A8A82', bg: '#242422' },
}

export default async function DamagePage() {
  if (!await hasPermission('damage', 'view')) {
    return (
      <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '40px', textAlign: 'center', fontSize: '13px', color: '#9A9A92' }}>
        Damage reports are not part of your access.
      </div>
    )
  }

  const supabase = createAdminClient()

  /*  No embed. damage_reports.booking_id is text and bookings.id is uuid with
      no constraint between them, so PostgREST cannot join them and asking it to
      returns an error, not an empty list. The stays are fetched by id and
      matched here. */
  const { data: reports, error } = await supabase
    .from('damage_reports').select('*').order('logged_at', { ascending: false })

  const directIds = (reports || []).filter(r => r.booking_kind !== 'platform' && r.booking_id).map(r => r.booking_id)
  const blockIds  = (reports || []).filter(r => r.booking_kind === 'platform' && r.booking_id).map(r => r.booking_id)

  const [{ data: stays }, { data: blocks }] = await Promise.all([
    directIds.length
      ? supabase.from('bookings').select('id, check_in, check_out, guest_id, guests(name)').in('id', directIds)
      : Promise.resolve({ data: [] as any[] }),
    blockIds.length
      ? supabase.from('calendar_blocks').select('id, start_date, end_date, guest_name, platform').in('id', blockIds)
      : Promise.resolve({ data: [] as any[] }),
  ])
  const stayById: Record<string, any> = {}
  for (const s of stays || []) stayById[s.id] = { name: (s as any).guests?.name || '—', from: s.check_in, href: `/keyholder/stays/booking/${s.id}` }
  for (const b of blocks || []) stayById[b.id] = { name: b.guest_name || b.platform || '—', from: b.start_date, href: `/keyholder/stays/block/${b.id}` }

  const live = (reports || []).filter(r => r.status !== 'dismissed')
  const claimed = live.reduce((sum, r) => sum + (Number(r.amount_claimed) || 0), 0)
  const openCount = (reports || []).filter(r => r.status === 'pending').length

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Management</div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>Damage reports.</h1>
        <p style={{ fontSize: '12px', color: '#8A8A82', marginTop: '8px', maxWidth: '620px', lineHeight: 1.6 }}>
          Every report, across stays. Filing one — and attaching the photographs it rests on — happens on the stay itself.
        </p>
      </div>

      {error && (
        <div style={{ background: '#2a1212', border: '0.5px solid #4a2020', padding: '14px 18px', fontSize: '12.5px', color: '#e74c3c', marginBottom: '18px' }}>
          The reports could not be read: {error.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: '1px', marginBottom: '24px' }}>
        {[
          { label: 'Reports', value: reports?.length || 0 },
          { label: 'Still pending', value: openCount },
          { label: 'Claimed, not dismissed', value: `$${claimed.toFixed(0)}` },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: '#242422', border: '0.5px solid #363634', padding: '16px 24px', flex: 1 }}>
            <div style={{ fontSize: '9px', letterSpacing: '.14em', textTransform: 'uppercase', color: '#666660', marginBottom: '6px' }}>{label}</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F5F2EC' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        {!reports?.length ? (
          <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '40px', textAlign: 'center', fontSize: '13px', color: '#666660', lineHeight: 1.7 }}>
            No damage reports.<br />
            <span style={{ fontSize: '12px' }}>Open a stay under Stays and file one there — the photos are already on that page.</span>
          </div>
        ) : reports.map(r => {
          const stay = r.booking_id ? stayById[r.booking_id] : null
          const s = STATUS[r.status] || STATUS.pending
          return (
            <div key={r.id} style={{ background: '#242422', border: '0.5px solid #363634', padding: '20px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 110px 130px', gap: '16px', alignItems: 'start' }}>
                <div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--amber)' }}>
                      {PROPERTY_NAMES[r.property_id] || r.property_id}
                    </span>
                    <span style={{ fontSize: '9px', padding: '2px 6px', background: s.bg, color: s.fg, letterSpacing: '.08em', textTransform: 'uppercase' }}>{s.label}</span>
                    {r.linked_to_deposit && (
                      <span style={{ fontSize: '9px', padding: '2px 6px', background: '#2a1f0a', color: '#f39c12', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                        Deposit
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '14px', color: '#F5F2EC', fontWeight: 500, marginBottom: '3px' }}>{r.item}</div>
                  {r.room && <div style={{ fontSize: '12px', color: '#9A9A92' }}>{r.room}</div>}
                  {r.description && <div style={{ fontSize: '12px', color: '#AEAEA6', marginTop: '6px', lineHeight: 1.5 }}>{r.description}</div>}
                  {stay && (
                    <div style={{ fontSize: '11px', color: '#666660', marginTop: '6px' }}>
                      {stay.name} · {stay.from ? format(new Date(stay.from + 'T12:00:00'), 'MMM d, yyyy') : '—'}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#666660', marginBottom: '4px' }}>Claimed</div>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: '24px', fontWeight: 300, color: r.amount_claimed ? '#e74c3c' : '#666660' }}>
                    {r.amount_claimed ? `$${Number(r.amount_claimed).toFixed(0)}` : '—'}
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: '#666660' }}>
                  {r.logged_at ? format(new Date(r.logged_at), 'MMM d, yyyy') : '—'}
                  {r.logged_by && <div style={{ marginTop: '3px' }}>{r.logged_by}</div>}
                </div>
                <div>
                  {stay ? (
                    <Link href={stay.href} style={{ fontSize: '11px', color: 'var(--amber)', textDecoration: 'none', letterSpacing: '.06em' }}>
                      Open the stay →
                    </Link>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#666660' }}>No stay attached</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
