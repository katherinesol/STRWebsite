'use client'
import { useCallback, useEffect, useState } from 'react'
import { L, F, microLabel, cardStyle } from '@/lib/design-tokens'

/*  Damage filed against this stay, beside the photographs it is argued from.
 *
 *  IT LIVES HERE AND NOT ON A PAGE OF ITS OWN because a damage report is a fact
 *  about one stay. The old /admin/damage/new asked you to pick the booking from
 *  a dropdown of every booking there is, which is the question the page you are
 *  already on has answered.
 *
 *  PHOTOS ARE PICKED, NOT RE-UPLOADED. The Condition photos control above this
 *  one already put the shots in the bucket with the time the shutter fired. A
 *  report says which of them it rests on. Ticking a photo onto a claim does not
 *  move it out of the walkthrough.
 *
 *  A REPORT IS DISMISSED, NOT DELETED. "Not pursuing" is a fact about the stay,
 *  and the photographs that showed the mark was already there are worth as much
 *  as the ones that showed it was not. Delete is kept for a genuine misfile and
 *  says so.
 *
 *  NO MONEY MOVES FROM THIS PANEL. "Against the deposit" records an intention;
 *  the deposit control is elsewhere and is what actually decides. Two buttons
 *  that both look like they take the money is how an amount gets claimed twice. */

type Photo = {
  id: string; url: string | null; tag: string; media_type: string
  captured_at: string | null; created_at: string; report_id: string | null
}
type Report = {
  id: string; item: string; room: string | null; description: string | null
  amount_claimed: number | null; linked_to_deposit: boolean; status: string
  logged_by: string | null; logged_at: string; approved_by: string | null
  approved_at: string | null; fixed_at: string | null
  photos: Photo[]
}

const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  pending:   { label: 'Pending',   fg: L.amber, bg: L.amberWash },
  approved:  { label: 'Approved',  fg: L.red,   bg: L.redWash },
  fixed:     { label: 'Fixed',     fg: L.green, bg: L.cardAlt },
  dismissed: { label: 'Dismissed', fg: L.inkFaint, bg: L.cardAlt },
}
const NEXT: Record<string, [string, string][]> = {
  pending:   [['approved', 'Approve'], ['dismissed', 'Dismiss']],
  approved:  [['fixed', 'Mark fixed'], ['dismissed', 'Dismiss']],
  fixed:     [['pending', 'Reopen']],
  dismissed: [['pending', 'Reopen']],
}

const when = (t: string | null) => t
  ? new Date(t).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '—'

const field: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: '8px',
  border: `1px solid ${L.line}`, background: L.card, color: L.ink,
  fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box',
}
const btn = (primary = false): React.CSSProperties => ({
  padding: '8px 13px', borderRadius: '8px', fontSize: '12.5px', cursor: 'pointer',
  border: primary ? 'none' : `1px solid ${L.line}`,
  background: primary ? L.ink : 'transparent', color: primary ? L.card : L.inkFaint,
})

const EMPTY = { item: '', room: '', description: '', amount_claimed: '', linked_to_deposit: false }

export default function DamagePanel({ bookingId, bookingKind, propertyId, canEdit }: {
  bookingId: string; bookingKind: 'direct' | 'platform'; propertyId: string; canEdit: boolean
}) {
  const [reports, setReports] = useState<Report[]>([])
  const [media, setMedia] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [picked, setPicked] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)   // report id whose picker is open

  const load = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([
        fetch(`/api/admin/damage?booking_id=${encodeURIComponent(bookingId)}`),
        fetch(`/api/admin/booking-media?booking_id=${encodeURIComponent(bookingId)}`),
      ])
      const rj = await r.json(), mj = await m.json()
      if (!r.ok) { setErr(rj.error || 'Could not load damage reports'); return }
      setReports(rj.reports || [])
      setMedia(m.ok ? (mj.media || []) : [])
      setErr('')
    } catch { setErr('Could not load damage reports') }
    finally { setLoading(false) }
  }, [bookingId])

  useEffect(() => { load() }, [load])

  async function file() {
    if (!form.item.trim() || saving) return
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/admin/damage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId, booking_kind: bookingKind, property_id: propertyId,
          item: form.item.trim(),
          room: form.room.trim() || null,
          description: form.description.trim() || null,
          amount_claimed: form.amount_claimed === '' ? null : Number(form.amount_claimed),
          linked_to_deposit: form.linked_to_deposit,
        }),
      })
      const j = await res.json()
      /*  The old form did `catch {}` and then routed to the list whatever
          happened, which is how a table that refused every insert looked like a
          table with nothing in it. A failure stays on screen here. */
      if (!res.ok) { setErr(j.error || 'The report was not saved.'); return }

      if (picked.length) {
        const a = await fetch('/api/admin/damage/photos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report_id: j.id, media_ids: picked }),
        })
        const aj = await a.json().catch(() => ({}))
        if (!a.ok) setErr(`Report saved, but the photos did not attach: ${aj.error || a.status}`)
        else if (aj.refused?.length) setErr(`${aj.refused.length} photo(s) were refused — not from this stay.`)
      }
      setForm({ ...EMPTY }); setPicked([]); setOpen(false)
      await load()
    } catch (e: any) { setErr(e?.message || 'The report was not saved.') }
    finally { setSaving(false) }
  }

  async function setStatus(id: string, status: string) {
    setBusy(id); setErr('')
    const res = await fetch(`/api/admin/damage?id=${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || 'Could not change the status') }
    setBusy(null); await load()
  }

  async function attach(reportId: string, ids: string[]) {
    if (!ids.length) return
    setErr('')
    const res = await fetch('/api/admin/damage/photos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_id: reportId, media_ids: ids }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(j.error || 'Could not attach the photos'); return }
    if (j.refused?.length) setErr(`${j.refused.length} photo(s) were refused — not from this stay.`)
    setAdding(null); setPicked([])
    await load()
  }

  async function detach(mediaId: string) {
    setErr('')
    const res = await fetch(`/api/admin/damage/photos?media_id=${mediaId}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || 'Could not detach the photo'); return }
    await load()
  }

  async function remove(id: string) {
    if (!confirm('Delete this report? Use Dismiss instead if the claim is simply not being pursued — that keeps the record. The photos stay either way.')) return
    setBusy(id)
    const res = await fetch(`/api/admin/damage?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || 'Could not delete') }
    setBusy(null); await load()
  }

  const claimed = reports
    .filter(r => r.status !== 'dismissed')
    .reduce((s, r) => s + (Number(r.amount_claimed) || 0), 0)
  const unattached = media.filter(m => !m.report_id)

  if (loading) return null

  /*  One picker, used when filing and again when adding to a report already
      filed. It offers only photos not yet on a claim, so the same shot cannot
      end up arguing two different reports. */
  const picker = unattached.length > 0 ? (
    <div>
      <div style={{ fontSize: '12px', color: L.inkMuted, marginBottom: '6px' }}>
        Photos from this stay ({picked.length} selected) — shoot them with Condition photos above first.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: '7px' }}>
        {unattached.map(p => {
          const on = picked.includes(p.id)
          return (
            <button key={p.id} type="button"
              onClick={() => setPicked(v => on ? v.filter(x => x !== p.id) : [...v, p.id])}
              title={`${p.tag} · ${when(p.captured_at || p.created_at)}`}
              style={{
                padding: 0, aspectRatio: '1', borderRadius: '9px', overflow: 'hidden', cursor: 'pointer',
                border: `2px solid ${on ? L.ink : L.line}`, background: L.cardAlt, position: 'relative',
              }}>
              {p.url
                ? <img src={p.url} alt={p.tag} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: on ? 1 : 0.75 }} />
                : <span style={{ fontSize: '10px', color: L.inkFaint }}>{p.tag}</span>}
              {on && <span style={{ position: 'absolute', top: '3px', left: '3px', background: L.ink, color: L.card, borderRadius: '5px', fontSize: '10px', padding: '1px 5px' }}>✓</span>}
            </button>
          )
        })}
      </div>
    </div>
  ) : (
    <div style={{ fontSize: '12px', color: L.inkFaint }}>
      No unattached photos on this stay yet. Upload them with Condition photos above — a report can be filed now and photos ticked on afterwards.
    </div>
  )

  return (
    <div style={{ ...cardStyle, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ ...microLabel }}>
          Damage{reports.length ? ` · ${reports.length}` : ''}
          {claimed > 0 && <span style={{ color: L.red }}> · ${claimed.toFixed(2)} claimed</span>}
        </div>
        {canEdit && !open && (
          <button onClick={() => { setOpen(true); setAdding(null); setPicked([]) }} style={btn()}>File a report</button>
        )}
      </div>

      {!reports.length && !open && (
        <div style={{ fontSize: '12.5px', color: L.inkFaint, marginTop: '8px' }}>
          Nothing reported for this stay.
        </div>
      )}

      {/* the reports */}
      {reports.map(r => {
        const s = STATUS[r.status] || STATUS.pending
        return (
          <div key={r.id} style={{ marginTop: '14px', paddingTop: '14px', borderTop: `1px solid ${L.line}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', color: L.ink }}>{r.item}</span>
              {r.room && <span style={{ fontSize: '12.5px', color: L.inkFaint }}>· {r.room}</span>}
              <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '6px', background: s.bg, color: s.fg }}>{s.label}</span>
              {r.amount_claimed != null && (
                <span style={{ fontSize: '13px', color: L.red, fontFamily: F.mono, marginLeft: 'auto' }}>
                  ${Number(r.amount_claimed).toFixed(2)}
                </span>
              )}
            </div>

            {r.description && (
              <div style={{ fontSize: '12.5px', color: L.inkMuted, marginTop: '5px', lineHeight: 1.5 }}>{r.description}</div>
            )}

            <div style={{ fontSize: '11.5px', color: L.inkFaint, marginTop: '5px', fontFamily: F.mono }}>
              logged {when(r.logged_at)}{r.logged_by ? ` · ${r.logged_by}` : ''}
              {r.approved_at && ` · approved ${when(r.approved_at)}${r.approved_by ? ` by ${r.approved_by}` : ''}`}
              {r.fixed_at && ` · fixed ${when(r.fixed_at)}`}
            </div>

            {r.linked_to_deposit && (
              <div style={{ fontSize: '11.5px', color: L.amber, marginTop: '4px' }}>
                Marked against the security deposit — the deposit itself is set in Lifecycle above.
              </div>
            )}

            {/* its photographs */}
            {r.photos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: '8px', marginTop: '10px' }}>
                {r.photos.map(p => (
                  <figure key={p.id} style={{ margin: 0 }}>
                    <div style={{ position: 'relative', aspectRatio: '1', borderRadius: '9px', overflow: 'hidden', border: `1px solid ${L.line}`, background: L.cardAlt }}>
                      {p.url
                        ? (p.media_type === 'video'
                          ? <video src={p.url} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <a href={p.url} target="_blank" rel="noreferrer">
                              <img src={p.url} alt={`${r.item} · ${when(p.captured_at || p.created_at)}`} loading="lazy"
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            </a>)
                        : <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: '11px', color: L.inkFaint }}>no preview</div>}
                      {canEdit && (
                        <button onClick={() => detach(p.id)} title="Remove from this report (the photo stays in the walkthrough)"
                          style={{ position: 'absolute', top: '4px', right: '4px', width: '22px', height: '22px', borderRadius: '6px', border: 'none', background: 'oklch(0.25 0.01 60 / 0.55)', color: '#fff', fontSize: '12px', cursor: 'pointer', lineHeight: 1 }}>×</button>
                      )}
                    </div>
                    <figcaption style={{ fontSize: '10.5px', color: L.inkFaint, marginTop: '3px', fontFamily: F.mono }}>
                      {when(p.captured_at || p.created_at)}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}

            {canEdit && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                {(NEXT[r.status] || []).map(([to, label]) => (
                  <button key={to} onClick={() => setStatus(r.id, to)} disabled={busy === r.id} style={btn()}>{label}</button>
                ))}
                {unattached.length > 0 && adding !== r.id && (
                  <button onClick={() => { setAdding(r.id); setOpen(false); setPicked([]) }} style={btn()}>Add photos</button>
                )}
                <button onClick={() => remove(r.id)} disabled={busy === r.id}
                  style={{ ...btn(), border: `1px solid ${L.redLine}`, color: L.red, marginLeft: 'auto' }}>Delete</button>
              </div>
            )}

            {canEdit && adding === r.id && (
              <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
                {picker}
                <div style={{ display: 'flex', gap: '7px' }}>
                  <button onClick={() => attach(r.id, picked)} disabled={!picked.length}
                    style={{ ...btn(true), opacity: picked.length ? 1 : 0.5 }}>
                    Attach {picked.length || ''}
                  </button>
                  <button onClick={() => { setAdding(null); setPicked([]) }} style={btn()}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* filing one */}
      {canEdit && open && (
        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: `1px solid ${L.line}`, display: 'grid', gap: '9px' }}>
          <input style={field} placeholder="What was damaged — e.g. Sofa arm, TV remote" autoFocus
            value={form.item} onChange={e => setForm(f => ({ ...f, item: e.target.value }))} />
          <input style={field} placeholder="Room (optional) — e.g. Living room"
            value={form.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))} />
          <textarea style={{ ...field, resize: 'vertical' }} rows={3} placeholder="What happened, and what it will take to put right"
            value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <input style={field} type="number" min="0" step="0.01" placeholder="Amount to claim (optional)"
            value={form.amount_claimed} onChange={e => setForm(f => ({ ...f, amount_claimed: e.target.value }))} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: L.inkMuted, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.linked_to_deposit}
              onChange={e => setForm(f => ({ ...f, linked_to_deposit: e.target.checked }))} />
            Claim against the security deposit
          </label>

          {picker}

          <div style={{ display: 'flex', gap: '7px' }}>
            <button onClick={file} disabled={!form.item.trim() || saving} style={{ ...btn(true), opacity: !form.item.trim() || saving ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'File report'}
            </button>
            <button onClick={() => { setOpen(false); setForm({ ...EMPTY }); setPicked([]); setErr('') }} style={btn()}>Cancel</button>
          </div>
        </div>
      )}

      {err && <div style={{ fontSize: '12.5px', color: L.red, marginTop: '10px' }}>{err}</div>}
    </div>
  )
}
