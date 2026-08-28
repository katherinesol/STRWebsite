'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { L, F, microLabel, cardStyle } from '@/lib/design-tokens'

/*  Attaching a platform booking to a guest record.
 *
 *  A synced reservation arrives with a name string and nothing else - no
 *  guest_id - so the same person across three stays is three unlinked strings
 *  until someone joins them up. That is what makes lifetime value, repeat-guest
 *  detection and the people list work at all.
 *
 *  SEARCH FIRST, CREATE ONLY DELIBERATELY. The old sync-platform route upserted
 *  "by email" and, when a platform gave no email, invented name@platform.noemail
 *  and looked the guest back up by the invention - five records still carry such
 *  an address and four duplicate pairs trace to it. So this searches, shows what
 *  it found, and links to an existing record on one click. Creating a new guest
 *  is a separate, explicit button, never the fallback when a search finds
 *  nothing.
 *
 *  Linking writes guest_id through the block PATCH, which is allowlisted and
 *  role-gated; creating goes through sync-platform, which is guests:'edit'. */

export default function GuestLink({ bookingId, guestName, guestId }: {
  bookingId: string; guestName: string | null; guestId: string | null
}) {
  const router = useRouter()
  const [q, setQ] = useState(guestName || '')
  const [hits, setHits] = useState<any[] | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  async function search() {
    setBusy('search'); setErr(''); setHits(null)
    try {
      const res = await fetch(`/api/admin/guests/search?q=${encodeURIComponent(q)}`)
      const j = await res.json()
      if (!res.ok) { setErr(j.error || 'Search failed'); return }
      setHits(j.guests || j.results || [])
    } catch { setErr('Search failed') } finally { setBusy('') }
  }

  async function link(id: string) {
    setBusy(id); setErr('')
    try {
      const res = await fetch(`/api/admin/calendar/block/${bookingId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guest_id: id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr([j.error, j.detail].filter(Boolean).join(' ') || 'Could not link'); return }
      router.refresh()
    } catch { setErr('Could not link') } finally { setBusy('') }
  }

  async function createNew() {
    if (!confirm(`Create a NEW guest record for "${q}"? Search first — a duplicate is far harder to undo than a missing link.`)) return
    setBusy('create'); setErr('')
    try {
      const res = await fetch('/api/admin/guests/sync-platform', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: q }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || 'Could not create'); return }
      if (j.guest?.id || j.id) await link(j.guest?.id || j.id)
      else router.refresh()
    } catch { setErr('Could not create') } finally { setBusy('') }
  }

  if (guestId) {
    return (
      <div style={{ ...cardStyle, padding: '18px 20px' }}>
        <div style={{ ...microLabel, marginBottom: '8px' }}>Guest record</div>
        <div style={{ fontSize: '13px', color: L.ink }}>
          Linked to <strong>{guestName || 'a guest record'}</strong>.
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...cardStyle, padding: '18px 20px' }}>
      <div style={{ ...microLabel, marginBottom: '8px' }}>Guest record</div>
      <div style={{ fontSize: '12.5px', color: L.inkFaint, lineHeight: 1.5, marginBottom: '10px' }}>
        This booking carries a name but no guest record, so it does not count toward repeat stays or
        lifetime value. Search before creating — a duplicate is harder to undo than a missing link.
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name"
          style={{ flex: 1, padding: '9px 11px', borderRadius: '8px', border: `1px solid ${L.line}`, background: L.cardAlt, color: L.ink, fontSize: '14px' }} />
        <button onClick={search} disabled={!q.trim() || !!busy}
          style={{ padding: '9px 14px', borderRadius: '8px', border: `1px solid ${L.ink}`, background: 'transparent', color: L.ink, fontSize: '13px', cursor: 'pointer' }}>
          {busy === 'search' ? '…' : 'Search'}
        </button>
      </div>

      {hits && (
        <div style={{ marginTop: '12px', display: 'grid', gap: '6px' }}>
          {hits.length === 0 && <div style={{ fontSize: '12.5px', color: L.inkFaint }}>Nobody matches that.</div>}
          {hits.map((g: any) => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', border: `1px solid ${L.line}`, borderRadius: '9px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: L.ink }}>{g.name || '—'}</div>
                <div style={{ fontSize: '11.5px', color: L.inkFaint, fontFamily: F.mono, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {[g.email, g.phone].filter(Boolean).join(' · ') || 'no contact details'}
                </div>
              </div>
              <button onClick={() => link(g.id)} disabled={!!busy}
                style={{ padding: '6px 11px', borderRadius: '7px', border: 'none', background: L.ink, color: L.card, fontSize: '12.5px', cursor: 'pointer' }}>
                {busy === g.id ? '…' : 'Link'}
              </button>
            </div>
          ))}
          <button onClick={createNew} disabled={!q.trim() || !!busy}
            style={{ marginTop: '4px', padding: '9px', borderRadius: '8px', border: `1px solid ${L.line}`, background: 'transparent', color: L.inkFaint, fontSize: '12.5px', cursor: 'pointer' }}>
            {busy === 'create' ? '…' : `None of these — create a new record for "${q}"`}
          </button>
        </div>
      )}
      {err && <div style={{ fontSize: '12.5px', color: L.red, marginTop: '8px' }}>{err}</div>}
    </div>
  )
}
