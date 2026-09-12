'use client'
import { useEffect, useState } from 'react'
import { L, F, microLabel } from '@/lib/design-tokens'

/*  Ordering water, on the shell Katherine actually uses.
 *
 *  The ordering feature was never broken — it was STRANDED. WaterOrderStatus is
 *  mounted inside CisternLevel, CisternLevel is mounted only on the legacy
 *  /admin dashboard, and Today shows the cistern level with no way to act on
 *  it. So the level said 11% and there was nothing to press. A delivery came on
 *  11 September and went unrecorded, which is what a stranded feature looks
 *  like from the outside: not an error, just nothing happening.
 *
 *  Same two API routes, same columns, same auto-detection behind them. This is
 *  a restyle onto the current tokens and a move to the surface in daily use,
 *  following StayConditions — not a fork of the logic.
 *
 *  ONE THING IS GENUINELY NEW: logging a delivery that has ALREADY HAPPENED.
 *  The old form could only open an order that was still coming, and
 *  auto-detection only ever closes an order that is already open, so a fill
 *  nobody pre-recorded could never be captured by either. That is the exact gap
 *  the 10 July and 11 September deliveries fell through.
 *
 *  The role comes in as a prop. The legacy component fetched /api/admin/tasks
 *  purely to read `role` off the response — a request for a task list, thrown
 *  away except for one field. The page here is a server component that already
 *  knows who is looking. */

type Refill = { date: string; from: number; to: number; rise: number }

const day = (s: string) =>
  new Date(s.length <= 10 ? s + 'T12:00:00Z' : s)
    .toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'America/Toronto' })

export default function WaterOrder({ canEdit, propertyId = 'nickel-beach' }: { canEdit: boolean; propertyId?: string }) {
  const [d, setD] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [form, setForm] = useState<null | { past: Refill | null }>(null)
  const [company, setCompany] = useState('')
  const [fresh, setFresh] = useState('')
  const [expected, setExpected] = useState('')
  const [showPast, setShowPast] = useState(false)

  const load = () => fetch(`/api/admin/water-order?property=${propertyId}`).then(r => r.json()).then(setD).catch(() => {})
  useEffect(() => { load() }, [propertyId])

  async function submit() {
    setBusy(true); setErr(null)
    const body: any = { company: fresh.trim() || company || null, property_id: propertyId }
    if (form?.past) body.delivered_at = form.past.date
    else body.expected_date = expected || null
    const r = await fetch('/api/admin/water-order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) return setErr(j.error || 'That did not save.')
    setForm(null); setCompany(''); setFresh(''); setExpected('')
    load()
  }

  async function markDelivered() {
    if (!d?.open) return
    setBusy(true); setErr(null)
    const r = await fetch('/api/admin/water-order', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.open.id }),
    })
    setBusy(false)
    if (!r.ok) return setErr('Could not mark it delivered.')
    load()
  }

  if (!d) return null
  const unlogged: Refill[] = d.unlogged || []

  const field: React.CSSProperties = {
    width: '100%', padding: '7px 9px', marginBottom: '6px', boxSizing: 'border-box',
    border: `1px solid ${L.line}`, borderRadius: '6px', background: L.card,
    fontSize: '13px', color: L.ink, outline: 'none', fontFamily: 'inherit',
  }
  const btn = (primary = false): React.CSSProperties => ({
    padding: '6px 13px', borderRadius: '7px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${primary ? L.ink : L.line}`,
    background: primary ? L.ink : L.card, color: primary ? L.onInk : L.inkBody,
  })

  /* ── the form, for a fill still coming or one already arrived ── */
  if (form) return (
    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${L.lineFaint}` }}>
      <div style={{ ...microLabel, marginBottom: '8px' }}>
        {form.past ? `Log the ${day(form.past.date)} delivery` : 'Order water'}
      </div>
      {d.companies?.length > 0 && (
        <select value={company} onChange={e => setCompany(e.target.value)} style={field}>
          <option value="">Who delivered it…</option>
          {d.companies.map((c: string) => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      <input placeholder="Or a company not listed" value={fresh} onChange={e => setFresh(e.target.value)} style={field} />
      {!form.past && (
        <input type="date" value={expected} onChange={e => setExpected(e.target.value)} style={field} title="Expected arrival" />
      )}
      {err && <div style={{ fontSize: '12px', color: L.red, margin: '2px 0 8px' }}>{err}</div>}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={submit} disabled={busy || (!company && !fresh.trim())} style={btn(true)}>
          {busy ? 'Saving…' : form.past ? 'Log it' : 'Order'}
        </button>
        <button onClick={() => { setForm(null); setErr(null) }} style={btn()}>Cancel</button>
      </div>
    </div>
  )

  return (
    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${L.lineFaint}` }}>

      {/* a fill the system never heard about */}
      {unlogged.map(u => (
        <div key={u.date} style={{
          marginBottom: '10px', padding: '9px 11px', borderRadius: '8px',
          background: L.amberWash, border: `1px solid ${L.amberLine}`,
        }}>
          <div style={{ fontSize: '12.5px', color: L.ink, lineHeight: 1.5 }}>
            Rose {u.rise}% on {day(u.date)} — {u.from}% to {u.to}%. A delivery?
          </div>
          {canEdit && (
            <button onClick={() => setForm({ past: u })} style={{ ...btn(), marginTop: '7px', padding: '4px 10px', fontSize: '12px' }}>
              Log it
            </button>
          )}
        </div>
      ))}

      {d.open ? (
        <>
          <div style={{ fontSize: '13px', color: L.green, fontWeight: 600 }}>Water ordered</div>
          <div style={{ fontSize: '12.5px', color: L.inkMuted, marginTop: '2px' }}>
            {d.open.company || 'Delivery'}{d.open.expected_date ? ` · expected ${day(d.open.expected_date)}` : ''}
          </div>
          {canEdit && <button onClick={markDelivered} disabled={busy} style={{ ...btn(), marginTop: '8px' }}>
            {busy ? 'Saving…' : 'Mark delivered'}
          </button>}
        </>
      ) : canEdit ? (
        <button onClick={() => setForm({ past: null })} style={btn()}>Order water</button>
      ) : null}

      {err && <div style={{ fontSize: '12px', color: L.red, marginTop: '6px' }}>{err}</div>}

      {d.history?.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <button onClick={() => setShowPast(s => !s)} style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontSize: '12px', color: L.inkFaint, textDecoration: 'underline', textUnderlineOffset: '3px',
          }}>
            {showPast ? 'Hide' : `Past deliveries (${d.history.length})`}
          </button>
          {showPast && (
            <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {d.history.map((h: any) => (
                <div key={h.id} style={{ fontSize: '12px', color: L.inkMuted, fontFamily: F.mono }}>
                  {h.delivered_at ? day(h.delivered_at) : '—'}{h.company ? ` · ${h.company}` : ''}
                  {h.auto_detected ? <span style={{ color: L.inkFaint }}> · auto</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
