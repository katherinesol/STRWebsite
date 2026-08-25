'use client'
import { useState, useEffect } from 'react'
import { L, F, microLabel } from '@/lib/design-tokens'

/* Everyone on this booking, and adding somebody to it.
 *
 *  THE LEAD IS NOT REMOVABLE HERE. Exactly one lead exists per booking — a
 *  partial unique index enforces it in the database — and deleting the row that
 *  holds that invariant would leave a booking whose payments, figures and guest
 *  history point at nobody. Reassigning the lead is a different action, and it
 *  is promotion, not deletion.
 *
 *  PARTY SIZE IS NOT THE ACCESS SET. bookings.guests is how many people are
 *  coming; this list is how many are recorded well enough to be given a door
 *  code. A family of six with two people here is normal, so the header says
 *  both numbers rather than implying one.
 *
 *  Adding goes through the one matcher, so a guest who already exists is linked
 *  rather than duplicated — the fabricated placeholder emails that split four
 *  guests in two came from five paths each answering "is this the same person"
 *  differently. */

type Person = {
  link_id: string; guest_id: string | null; role: 'lead' | 'co_guest'
  name?: string | null; first_name?: string | null; last_name?: string | null
  email?: string | null; phone?: string | null
}

const field: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '10px',
  border: `1px solid ${L.line}`, background: L.card, color: L.ink,
  fontSize: '14px', fontFamily: F.sans, boxSizing: 'border-box',
}

export default function CoGuests({ bookingId, kind }: { bookingId: string; kind: 'direct' | 'platform' }) {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [party, setParty] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirming, setConfirming] = useState<any>(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '' })
  const [err, setErr] = useState('')

  const load = () => fetch(`/api/admin/bookings/guests?booking_id=${bookingId}&booking_kind=${kind}`)
    .then(r => r.json())
    .then(d => { setPeople(d.people || []); setParty(d.party_size ?? null) })
    .catch(() => setPeople([]))
  useEffect(() => { load() }, [bookingId, kind])

  async function add(extra: Record<string, unknown> = {}) {
    if (!form.first_name.trim() && !form.last_name.trim()) { setErr('A name is required.'); return }
    setBusy(true); setErr(''); setMsg('')
    const r = await fetch('/api/admin/bookings/guests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: bookingId, booking_kind: kind, ...form, ...extra }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    /* The server found somebody with this name and will not choose for us. */
    if (r.status === 409 && j.needs_confirmation) { setConfirming(j); return }
    if (!r.ok) { setErr(j.error || `Could not add (${r.status})`); return }
    setConfirming(null)
    setMsg(j.linkage || 'added')
    setForm({ first_name: '', last_name: '', email: '', phone: '' })
    setAdding(false); load()
  }

  async function remove(p: Person) {
    if (!confirm(`Remove ${p.name || 'this person'} from the booking? They lose access to the door code and guide.`)) return
    setErr(''); setMsg('')
    const r = await fetch(`/api/admin/bookings/guests?link_id=${p.link_id}`, { method: 'DELETE' })
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || `Could not remove (${r.status})`); return }
    load()
  }

  if (!people) return null
  const withAccess = people.length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', color: L.inkBody }}>
          {party != null ? `${party} guest${party === 1 ? '' : 's'} · ` : ''}
          {withAccess} with access
        </span>
        <button onClick={() => { setAdding(!adding); setErr('') }}
          style={{ marginLeft: 'auto', padding: '8px 15px', borderRadius: '99px', border: `1px solid ${L.line}`,
            background: adding ? L.ink : L.card, color: adding ? '#fff' : L.ink,
            fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: F.sans }}>
          {adding ? 'Cancel' : 'Add someone'}
        </button>
      </div>

      <div style={{ border: `1px solid ${L.line}`, borderRadius: '12px', overflow: 'hidden' }}>
        {people.map((p, i) => (
          <div key={p.link_id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
            borderTop: i ? `1px solid ${L.lineFaint}` : 'none' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '14px', color: L.ink }}>
                {p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || '—'}
                {!p.last_name && (
                  <span title="No surname — this person cannot verify at the guest gate"
                    style={{ marginLeft: '8px', fontSize: '11px', color: L.red }}>no surname</span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: L.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[p.email, p.phone].filter(Boolean).join(' · ') || 'no contact details'}
              </div>
            </div>
            {p.role === 'lead' ? (
              <span style={{ fontSize: '10px', fontFamily: F.mono, letterSpacing: '0.08em', textTransform: 'uppercase',
                padding: '4px 9px', borderRadius: '99px', background: L.ink, color: '#fff' }}>lead</span>
            ) : (
              <button onClick={() => remove(p)} title="Remove from this booking"
                style={{ background: 'none', border: 'none', color: L.inkFaint, fontSize: '15px', cursor: 'pointer' }}>×</button>
            )}
          </div>
        ))}
        {!people.length && (
          <div style={{ padding: '16px 14px', fontSize: '13px', color: L.inkMuted }}>
            Nobody recorded on this booking.
          </div>
        )}
      </div>

      {adding && (
        <div style={{ marginTop: '14px', padding: '16px', border: `1px solid ${L.line}`, borderRadius: '12px', background: L.cardAlt }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><span style={microLabel}>First name</span>
              <input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} style={field} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><span style={microLabel}>Last name</span>
              <input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} style={field} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><span style={microLabel}>Email</span>
              <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={field} /></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}><span style={microLabel}>Phone</span>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={field} /></label>
          </div>
          <p style={{ fontSize: '12px', color: L.inkFaint, margin: '10px 0 0' }}>
            The surname is what the guest types to verify, so a co-guest without one
            cannot get in. If this person is already a guest, they are linked rather
            than duplicated.
          </p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '12px', alignItems: 'center' }}>
            <button onClick={() => add()} disabled={busy}
              style={{ padding: '10px 18px', borderRadius: '10px', background: busy ? L.lineSoft : L.ink,
                color: busy ? L.inkFaint : '#fff', border: 'none', fontSize: '14px', fontWeight: 600,
                cursor: busy ? 'wait' : 'pointer', fontFamily: F.sans }}>
              {busy ? 'Adding…' : 'Add to booking'}
            </button>
          </div>
          {confirming && (
            <div style={{ marginTop: '12px', padding: '14px', borderRadius: '10px',
              background: L.amberWash, border: `1px solid ${L.amberLine}` }}>
              <div style={{ fontSize: '13px', color: L.ink }}>{confirming.message}</div>
              {confirming.candidate && (
                <div style={{ fontSize: '12px', color: L.inkMuted, marginTop: '4px' }}>
                  {[confirming.candidate.email, confirming.candidate.phone].filter(Boolean).join(' · ') || 'no contact details on that record'}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                <button onClick={() => add({ guest_id: confirming.candidate?.id })} disabled={busy}
                  style={{ padding: '8px 14px', borderRadius: '99px', background: L.ink, color: '#fff',
                    border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: F.sans }}>
                  Yes — same person
                </button>
                <button onClick={() => add({ force_new: true })} disabled={busy}
                  style={{ padding: '8px 14px', borderRadius: '99px', background: L.card, color: L.ink,
                    border: `1px solid ${L.line}`, fontSize: '13px', cursor: 'pointer', fontFamily: F.sans }}>
                  No — different person
                </button>
              </div>
            </div>
          )}
          {err && <div style={{ fontSize: '13px', color: L.red, marginTop: '10px' }}>{err}</div>}
        </div>
      )}
      {!adding && err && <div style={{ fontSize: '13px', color: L.red, marginTop: '10px' }}>{err}</div>}
      {msg && <div style={{ fontSize: '12px', color: L.inkFaint, marginTop: '10px' }}>{msg}</div>}
    </div>
  )
}
