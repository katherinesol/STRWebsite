import Link from 'next/link'
import { redirect } from 'next/navigation'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { guestStats } from '@/lib/keyholder/guest-stats'
import { findDuplicateCandidates, nameOnlyLinks, isSyntheticEmail } from '@/lib/keyholder/guest-match'
import { L, F, microLabel, cardStyle, money } from '@/lib/design-tokens'

export const dynamic = 'force-dynamic'

export default async function People() {
  /* PII — names, addresses, phone numbers, free-text notes. Owner and co-owner
     only, checked here as well as on the endpoints, because a page that renders
     the list is as much an exposure as a route that returns it. */
  if (!await hasRole('owner', 'co-owner')) redirect('/keyholder')

  const supabase = createAdminClient()
  const [{ data: guests }, stats] = await Promise.all([
    supabase.from('guests').select('id, name, email, phone, id_verified, notes').order('name'),
    guestStats(),
  ])
  const G = guests || []
  const counts = Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, v.stays]))
  const pairs = findDuplicateCandidates(G)
  const fused = nameOnlyLinks(G, counts)

  const withStats = G.map(g => ({ ...g, s: stats[g.id] || { stays: 0, direct: 0, platform: 0, lifetime: 0, firstStay: null, lastStay: null, returning: false } }))
  const returning = withStats.filter(g => g.s.returning).sort((a, b) => b.s.lifetime - a.s.lifetime)
  const once = withStats.filter(g => g.s.stays === 1).sort((a, b) => (b.s.lastStay || '').localeCompare(a.s.lastStay || ''))
  const never = withStats.filter(g => g.s.stays === 0)

  const row = (g: any, i: number) => (
    <Link key={g.id} href={`/keyholder/people/${g.id}`} style={{
      display: 'grid', gridTemplateColumns: '1.6fr 1.7fr 1fr 0.7fr 0.9fr', alignItems: 'center', gap: '14px',
      padding: '13px 22px', textDecoration: 'none', color: L.ink,
      borderTop: i ? `1px solid ${L.lineFaint}` : 'none',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
        <span style={{ fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name || '—'}</span>
        {g.id_verified && <span style={{ ...microLabel, color: L.green }}>ID</span>}
      </span>
      <span style={{ fontSize: '13px', color: isSyntheticEmail(g.email) ? L.amber : L.inkBody, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {isSyntheticEmail(g.email) ? 'placeholder address' : (g.email || (g.phone ? g.phone : <span style={{ color: L.inkFaint }}>no contact details</span>))}
      </span>
      <span style={{ fontSize: '13px', color: L.inkMuted }}>
        {g.s.stays === 0 ? 'never stayed' : `${g.s.stays} stay${g.s.stays === 1 ? '' : 's'}${g.s.platform && g.s.direct ? ' · both' : g.s.platform ? ' · platform' : ' · direct'}`}
      </span>
      <span style={{ fontSize: '13px', color: L.inkMuted }}>{g.s.lastStay ? g.s.lastStay.slice(0, 7) : '—'}</span>
      <span style={{ textAlign: 'right', fontFamily: F.mono, fontSize: '13px' }}>{g.s.lifetime ? money(g.s.lifetime) : '—'}</span>
    </Link>
  )

  const group = (title: string, note: string, list: any[]) => list.length ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <span style={{ fontSize: '15px', fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: '14px', color: L.inkFaint }}>{list.length}</span>
        <span style={{ marginLeft: 'auto', fontSize: '13px', color: L.inkMuted }}>{note}</span>
      </div>
      <div style={{ ...cardStyle, overflow: 'hidden' }}>{list.map(row)}</div>
    </div>
  ) : null

  return (
    <div style={{ paddingTop: '40px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={microLabel}>People · {G.length} records</span>
        <span style={{ fontFamily: F.serif, fontSize: '42px', lineHeight: 1.05 }}>Guests</span>
        <span style={{ fontSize: '15px', color: L.inkBody, maxWidth: '620px', lineHeight: 1.5 }}>
          Counted from the bookings across both tables, not read off a flag. Nine records
          claim to be returning guests; {returning.length === 0 ? 'none has actually come back' :
          returning.length === 1 ? 'one has' : `${returning.length} have`}. Consecutive stays at the same
          property count once — a trip that changes platform half way through is still one visit.
        </span>
      </div>

      {/* ───── needs a decision ───── */}
      {(pairs.length > 0 || fused.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>Worth your eye</span>
            <span style={{ marginLeft: 'auto', fontSize: '13px', color: L.inkMuted }}>nothing here happens on its own</span>
          </div>

          <div style={{ ...cardStyle, border: `1px solid ${L.amberLine}`, overflow: 'hidden' }}>
            <div style={{ padding: '11px 22px', background: L.amberWash, borderBottom: `1px solid ${L.amberLine}` }}>
              <span style={{ ...microLabel, color: L.amber }}>
                Possibly the same person · {pairs.length}
              </span>
            </div>
            {pairs.length === 0 ? (
              <div style={{ padding: '16px 22px', fontSize: '13px', color: L.inkMuted }}>None.</div>
            ) : pairs.map((c, i) => {
              const as = stats[c.a.id], bs = stats[c.b.id]
              return (
                <div key={`${c.a.id}|${c.b.id}`} style={{
                  display: 'flex', alignItems: 'center', gap: '16px', padding: '15px 22px',
                  borderTop: i ? `1px solid ${L.lineFaint}` : 'none', flexWrap: 'wrap',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '180px' }}>
                    <Link href={`/keyholder/people/${c.a.id}`} style={{ fontSize: '14px', fontWeight: 600, color: L.ink, textDecoration: 'none' }}>{c.a.name || '—'}</Link>
                    <span style={{ fontSize: '12px', color: L.inkMuted }}>{as?.stays || 0} stays · {isSyntheticEmail(c.a.email) ? 'placeholder address' : (c.a.email || c.a.phone || 'no contact')}</span>
                  </div>
                  <span style={{ fontSize: '15px', color: L.inkFaint }}>↔</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '180px' }}>
                    <Link href={`/keyholder/people/${c.b.id}`} style={{ fontSize: '14px', fontWeight: 600, color: L.ink, textDecoration: 'none' }}>{c.b.name || '—'}</Link>
                    <span style={{ fontSize: '12px', color: L.inkMuted }}>{bs?.stays || 0} stays · {isSyntheticEmail(c.b.email) ? 'placeholder address' : (c.b.email || c.b.phone || 'no contact')}</span>
                  </div>
                  <span style={{ fontSize: '13px', color: c.confidence === 'high' ? L.ink : L.inkMuted, flex: 1, minWidth: '200px' }}>{c.reason}</span>
                  <span style={{ padding: '8px 14px', borderRadius: '9px', border: `1px solid ${L.line}`, fontSize: '13px', fontWeight: 600, color: L.inkFaint }}>
                    Review — merge arrives next
                  </span>
                </div>
              )
            })}
          </div>

          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ padding: '11px 22px', background: L.cardAlt, borderBottom: `1px solid ${L.lineSoft}` }}>
              <span style={microLabel}>Stays fused on a name alone · {fused.length}</span>
            </div>
            {fused.length === 0 ? (
              <div style={{ padding: '16px 22px', fontSize: '13px', color: L.inkMuted, lineHeight: 1.55 }}>
                None. No guest without an email or a phone has more than one stay, so nothing
                has been joined up on a name by itself.
              </div>
            ) : fused.map((f, i) => (
              <div key={f.guest.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 22px', borderTop: i ? `1px solid ${L.lineFaint}` : 'none' }}>
                <Link href={`/keyholder/people/${f.guest.id}`} style={{ fontSize: '14px', fontWeight: 600, color: L.ink, textDecoration: 'none', minWidth: '180px' }}>{f.guest.name}</Link>
                <span style={{ fontSize: '13px', color: L.inkBody, flex: 1 }}>{f.why}</span>
                <span style={{ fontFamily: F.mono, fontSize: '13px' }}>{f.bookings}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {group('Returning', 'more than one stay, counted across both tables', returning)}
      {group('Stayed once', 'most recent first', once)}
      {group('No stay on record', 'usually a duplicate left behind, or someone who enquired', never)}
    </div>
  )
}
