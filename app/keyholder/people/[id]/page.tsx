import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { format } from 'date-fns'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { guestStats } from '@/lib/keyholder/guest-stats'
import { isSyntheticEmail } from '@/lib/keyholder/guest-match'
import { L, F, microLabel, cardStyle, money, platformColour } from '@/lib/design-tokens'

export const dynamic = 'force-dynamic'
const day = (d: string) => new Date(d + 'T12:00:00')

export default async function Person({ params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) redirect('/keyholder')
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: g }, { data: direct }, { data: plat }, stats] = await Promise.all([
    supabase.from('guests').select('*').eq('id', id).maybeSingle(),
    supabase.from('bookings').select('id, property_id, check_in, check_out, total, status').eq('guest_id', id).order('check_in', { ascending: false }),
    supabase.from('calendar_blocks').select('id, property_id, platform, start_date, end_date, payout_amount, accommodation').eq('guest_id', id).eq('is_booking', true).order('start_date', { ascending: false }),
    guestStats(),
  ])
  if (!g) notFound()
  const s = stats[id] || { stays: 0, direct: 0, platform: 0, lifetime: 0, firstStay: null, lastStay: null, returning: false }

  /* One history, both tables. A guest with a direct stay and an Airbnb stay has
     returned; anything reading a single table says otherwise. */
  const history = [
    ...(direct || []).map(b => ({ id: b.id, kind: 'direct', href: `/keyholder/stays/booking/${b.id}`, property: b.property_id, from: b.check_in, to: b.check_out, value: Number(b.total) || 0, note: b.status })),
    ...(plat || []).map(b => ({ id: b.id, kind: b.platform || 'manual', href: `/keyholder/stays/block/${b.id}`, property: b.property_id, from: b.start_date, to: b.end_date, value: Number(b.payout_amount) || Number(b.accommodation) || 0, note: null })),
  ].sort((a, b) => String(b.from).localeCompare(String(a.from)))

  const stat = (label: string, v: React.ReactNode, sub?: string) => (
    <div style={{ ...cardStyle, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <span style={microLabel}>{label}</span>
      <span style={{ fontFamily: F.serif, fontSize: '26px', lineHeight: 1.1 }}>{v}</span>
      {sub && <span style={{ fontSize: '12px', color: L.inkMuted }}>{sub}</span>}
    </div>
  )

  return (
    <div style={{ paddingTop: '30px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        <Link href="/keyholder/people" style={{ fontSize: '13px', color: L.inkMuted, textDecoration: 'none' }}>← People</Link>
        <span style={{ fontFamily: F.serif, fontSize: '40px', lineHeight: 1 }}>{g.name || '—'}</span>
        <span style={{ fontSize: '15px', color: L.inkBody }}>
          {s.returning ? 'Returning guest' : s.stays === 1 ? 'One stay' : 'No stay on record'}
          {g.id_verified ? ' · ID verified' : ' · not ID-verified'}
          {g.referral_code ? ` · referral ${g.referral_code}` : ''}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        {stat('Stays', s.stays, s.direct && s.platform ? `${s.direct} direct · ${s.platform} platform` : undefined)}
        {stat('Lifetime', money(s.lifetime), 'direct totals + platform payouts')}
        {stat('First stay', s.firstStay ? format(day(s.firstStay), 'MMM yyyy') : '—')}
        {stat('Last stay', s.lastStay ? format(day(s.lastStay), 'MMM yyyy') : '—')}
      </div>

      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1.4, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
          <span style={{ fontSize: '15px', fontWeight: 600 }}>Stay history</span>
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            {history.length === 0 ? (
              <div style={{ padding: '20px 22px', fontSize: '14px', color: L.inkMuted }}>
                No bookings attached to this record. Often a duplicate left behind by an
                older matching rule — check the People page for a suggested pair.
              </div>
            ) : history.map((h, i) => (
              <Link key={h.id} href={h.href} style={{
                display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1fr 0.8fr', alignItems: 'center', gap: '14px',
                padding: '13px 22px', textDecoration: 'none', color: L.ink,
                borderTop: i ? `1px solid ${L.lineFaint}` : 'none',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '3px', background: platformColour(h.kind).bg, flex: 'none' }} />
                  <span style={{ fontSize: '13px' }}>{h.from ? format(day(h.from), 'MMM d yyyy') : '—'}</span>
                </span>
                <span style={{ fontSize: '13px', color: L.inkBody }}>{h.property}</span>
                <span style={{ fontSize: '13px', color: L.inkMuted }}>{h.kind}{h.note ? ` · ${h.note}` : ''}</span>
                <span style={{ textAlign: 'right', fontFamily: F.mono, fontSize: '13px' }}>{h.value ? money(h.value) : '—'}</span>
              </Link>
            ))}
          </div>
        </div>

        <div style={{ width: '360px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ ...cardStyle, padding: '22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>Contact</span>
            {([['Email', isSyntheticEmail(g.email) ? null : g.email], ['Phone', g.phone]] as const).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', fontSize: '13px' }}>
                <span style={{ color: L.inkMuted, width: '80px' }}>{k}</span>
                <span style={{ color: v ? L.ink : L.inkFaint }}>{v || 'none on file'}</span>
              </div>
            ))}
            {isSyntheticEmail(g.email) && (
              <span style={{ fontSize: '12px', color: L.amber, lineHeight: 1.5 }}>
                The address on this record is a placeholder an old import invented
                ({g.email}). It is not an address anyone can be reached at, and it is
                treated as no address at all when matching.
              </span>
            )}
            <span style={{ fontSize: '12px', color: L.inkFaint }}>Editing arrives with the merge tool.</span>
          </div>

          {g.notes && (
            <div style={{ ...cardStyle, padding: '22px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600 }}>Notes</span>
              <span style={{ fontSize: '13px', color: L.inkBody, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{g.notes}</span>
            </div>
          )}

          <div style={{ ...cardStyle, padding: '22px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>Returning</span>
            <span style={{ fontSize: '13px', color: L.inkBody, lineHeight: 1.55 }}>
              Counted from {s.stays} booking{s.stays === 1 ? '' : 's'} across both tables, not read
              from the stored flag — which says <strong>{String(!!g.returning_guest)}</strong> and is
              wrong on nine records.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
