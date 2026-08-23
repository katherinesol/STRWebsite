'use client'
import { useState } from 'react'
import { L, F, microLabel, cardStyle, money } from '@/lib/design-tokens'

// The confirm step for a booking Haussy proposed.
//
// Nothing reaches the database from typed text or a screenshot directly. The draft
// is priced server-side, shown here in full — guest, dates, money, the computed
// HST/MAT split, overlaps, and every side effect — and only this card's confirm
// button commits, in one transaction.
//
// Ids are generated here, once, when the card opens. A double-click therefore
// collides on the primary key instead of creating a second booking.

const PROP_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East', 'royal-york-west': 'Royal York West',
  'nickel-beach': 'Nickel Beach Retreat',
}

const FIELDS: [string, string, 'text' | 'number' | 'date'][] = [
  ['guest_name', 'Guest', 'text'], ['guest_email', 'Email', 'text'], ['guest_phone', 'Phone', 'text'],
  ['check_in', 'Check-in', 'date'], ['check_out', 'Check-out', 'date'],
  ['guests_count', '# of guests', 'number'],
  ['nightly_rate', 'Nightly rate', 'number'], ['accommodation', 'Accommodation', 'number'],
  ['cleaning_fee', 'Cleaning', 'number'], ['extras', 'Extras', 'number'], ['discount', 'Discount', 'number'],
  ['commission', 'Host fee', 'number'], ['payment_processing_fee', 'Processing fee', 'number'],
  ['taxes_collected', 'Tax the guest paid', 'number'],
  ['taxes_platform_remits', 'Of that, the platform remits', 'number'],
  ['confirmation_code', 'Confirmation code', 'text'], ['door_code', 'Door code', 'text'],
]

const inp: React.CSSProperties = {
  padding: '9px 11px', border: `1px solid ${L.line}`, borderRadius: '9px',
  fontSize: '14px', fontFamily: F.sans, background: '#fff', width: '100%', boxSizing: 'border-box',
}
const rowS: React.CSSProperties = { display: 'flex', fontSize: '13px', padding: '3px 0' }

export default function BookingProposalCard({ draft, preview, busy, err, onEdit, onConfirm, onCancel }: {
  draft: any; preview: any; busy: boolean; err: string
  onEdit: (patch: any) => void
  onConfirm: (opts: { createExpenses: boolean; ids: any; mode: 'create' | 'merge'; targetId?: string }) => void
  onCancel: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [createExpenses, setCreateExpenses] = useState(true)
  // generated once per card — the idempotency key for this proposal
  const [ids] = useState(() => ({
    booking: crypto.randomUUID(), guest: crypto.randomUUID(),
    expenses: [crypto.randomUUID(), crypto.randomUUID()],
  }))

  if (!preview) return null
  const t = preview.tax, m = preview.money, g = preview.guest
  const mi = preview.merge_into
  const hasOverlap = preview.overlaps?.length > 0
  const varianceBad = t.variance != null && Math.abs(t.variance) > 0.005

  return (
    <div style={{ ...cardStyle, borderRadius: '18px', padding: '26px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <span style={microLabel}>
          {mi ? 'Haussy found this booking already · nothing is saved yet' : 'Haussy proposes a booking · nothing is saved yet'}
        </span>
        <span style={{ fontFamily: F.serif, fontSize: '27px', lineHeight: 1.15 }}>
          {g.name || 'Unnamed guest'} · {PROP_NAMES[preview.property_id] || preview.property_id}
        </span>
        <span style={{ fontSize: '14px', color: L.inkBody }}>
          {preview.check_in} → {preview.check_out} · {preview.nights} night{preview.nights === 1 ? '' : 's'} ·{' '}
          {preview.guests} guest{preview.guests === 1 ? '' : 's'}
          {preview.guests_assumed && <span style={{ color: L.amber }}> (assumed — you didn&rsquo;t say)</span>} ·{' '}
          {preview.kind === 'direct' ? 'direct' : preview.platform}
        </span>
      </div>

      {/* WHAT THE SCREENSHOT ADDS — only when an existing booking matches */}
      {mi && (
        <div style={{ background: L.cardAlt, borderRadius: '12px', padding: '14px 16px' }}>
          <span style={microLabel}>What this fills in</span>
          <div style={{ fontSize: '12px', color: L.inkMuted, marginTop: '4px', lineHeight: 1.5 }}>
            {mi.was_bare
              ? 'This row came from the feed with only dates on it.'
              : 'This booking already exists; only the fields below change.'}
            {!mi.had_tax && ' Its tax columns are empty — this is the first time they get set.'}
          </div>
          <div style={{ marginTop: '9px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {mi.changes.length === 0 && (
              <span style={{ fontSize: '13px', color: L.inkMuted }}>Nothing to add — the booking already matches.</span>
            )}
            {mi.changes.map((c: any) => (
              <div key={c.field} style={{ display: 'flex', gap: '10px', fontSize: '12.5px', alignItems: 'baseline' }}>
                <span style={{ color: L.inkMuted, minWidth: '150px' }}>{c.field.replace(/_/g, ' ')}</span>
                <span style={{ color: L.inkFaint, fontFamily: F.mono, fontSize: '11px' }}>{c.from === null || c.from === '' ? '—' : String(c.from)}</span>
                <span style={{ color: L.inkFaint }}>→</span>
                <span style={{ fontFamily: F.mono, fontSize: '11px' }}><strong>{String(c.to)}</strong></span>
              </div>
            ))}
          </div>
          {mi.unchanged.length > 0 && (
            <div style={{ fontSize: '11.5px', color: L.inkFaint, marginTop: '9px', lineHeight: 1.5 }}>
              Unchanged: {mi.unchanged.slice(0, 8).join(', ')}{mi.unchanged.length > 8 ? ` +${mi.unchanged.length - 8} more` : ''}.
              Anything the screenshot doesn&rsquo;t mention is left exactly as it is.
            </div>
          )}
        </div>
      )}

      {/* GUEST */}
      <div style={{ background: L.cardAlt, borderRadius: '12px', padding: '14px 16px' }}>
        <span style={microLabel}>Guest</span>
        <div style={{ marginTop: '6px', fontSize: '13px' }}>
          {g.existing
            ? <>Matches existing guest <strong>{g.existing.name}</strong> — {g.existing.prior_stays} prior stay{g.existing.prior_stays === 1 ? '' : 's'}. Will be linked, not duplicated.</>
            : g.name
              ? <>New guest — a record for <strong>{g.name}</strong> will be created.</>
              : <span style={{ color: L.inkMuted }}>No guest name. The booking will be created without one.</span>}
        </div>
      </div>

      {/* MONEY */}
      <div style={{ background: L.cardAlt, borderRadius: '12px', padding: '14px 16px' }}>
        <span style={microLabel}>Money</span>
        <div style={{ marginTop: '6px' }}>
          <div style={rowS}><span style={{ color: L.inkMuted }}>Accommodation</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(m.accommodation)}</span></div>
          {m.discount > 0 && <div style={rowS}><span style={{ color: L.inkMuted }}>Discount</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>−{money(m.discount)}</span></div>}
          {m.cleaning > 0 && <div style={rowS}><span style={{ color: L.inkMuted }}>Cleaning</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(m.cleaning)}</span></div>}
          {m.extras > 0 && <div style={rowS}><span style={{ color: L.inkMuted }}>Extras</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(m.extras)}</span></div>}
          <div style={{ height: '1px', background: L.lineSoft, margin: '7px 0' }} />
          <div style={rowS}><span>Room (MAT base)</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(m.room)}</span></div>
        </div>
      </div>

      {/* TAX */}
      <div style={{
        background: t.apply_tax ? L.cardAlt : 'transparent', borderRadius: '12px', padding: '14px 16px',
        border: `1px solid ${t.apply_tax ? 'transparent' : L.line}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={microLabel}>Tax — computed from the rules</span>
          <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', cursor: 'pointer' }}>
            <input type="checkbox" checked={t.apply_tax} onChange={e => onEdit({ apply_tax: e.target.checked })} />
            apply_tax
          </label>
        </div>
        <div style={{ marginTop: '7px' }}>
          {t.apply_tax ? <>
            {t.mat_exempt
              ? <div style={rowS}><span style={{ color: L.inkMuted }}>MAT</span><span style={{ marginLeft: 'auto', color: L.inkBody }}>exempt — stay is over 29 nights</span></div>
              : <div style={rowS}><span style={{ color: L.inkMuted }}>MAT {(t.mat_rate * 100).toFixed(t.mat_rate * 100 % 1 ? 1 : 0)}% on room</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(t.mat)}</span></div>}
            {/* The base is room + cleaning + MAT. The label used to omit cleaning,
                which made a correct figure look like it had been computed wrong —
                on a $875 room with $69 cleaning, 13% of "room + MAT" is $120.51
                but the card showed the true $129.55 beside that label. */}
            <div style={rowS}>
              <span style={{ color: L.inkMuted }}>
                HST 13% on room{Number(t.hst_base) > Number(m.room) + Number(t.mat) + 0.005 ? ' + cleaning' : ''}{t.mat_exempt ? '' : ' + MAT'}
              </span>
              <span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(t.hst)}</span>
            </div>
            <div style={{ height: '1px', background: L.lineSoft, margin: '7px 0' }} />
            <div style={{ ...rowS, fontSize: '14px' }}><span>Tax owed</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}><strong>{money(t.owed)}</strong></span></div>
            {t.remit_source === 'unknown' ? (
              <div style={{ ...rowS, color: L.amber }}>
                <span>Who remits</span>
                <span style={{ marginLeft: 'auto', textAlign: 'right', maxWidth: '62%' }}>
                  VRBO prints it on the payout screenshot. Put it in &ldquo;Of that, the platform remits&rdquo; —
                  left blank, neither figure is written and whatever is on the booking stays.
                </span>
              </div>
            ) : (<>
              <div style={rowS}><span style={{ color: L.inkMuted }}>You remit</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(t.you_remit)}</span></div>
              {(t.platform_remits ?? 0) > 0 && (
                <div style={rowS}>
                  <span style={{ color: L.inkMuted }}>Platform remits{t.remit_source === 'reported' ? ' · from the screenshot' : ''}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(t.platform_remits)}</span>
                </div>
              )}
            </>)}
            <div style={{ ...rowS, fontSize: '14px', paddingTop: '7px' }}><span>Guest total</span><span style={{ marginLeft: 'auto', fontFamily: F.mono }}>{money(m.guest_total)}</span></div>
          </> : (
            <span style={{ fontSize: '13px', color: L.inkBody }}>{t.explainer}</span>
          )}
        </div>
        {t.apply_tax && (
          <span style={{ display: 'block', fontSize: '12px', color: L.inkMuted, marginTop: '8px', lineHeight: 1.5 }}>{t.explainer}</span>
        )}
        {varianceBad && (
          <div style={{ marginTop: '10px', padding: '11px 13px', background: L.amberWash, border: `1px solid ${L.amberLine}`, borderRadius: '10px', fontSize: '12px', lineHeight: 1.55, color: L.amber }}>
            The platform reported <strong>{money(t.collected_reported)}</strong> collected but <strong>{money(t.owed)}</strong> is owed
            under the rules — a variance of {money(Math.abs(t.variance))} {t.variance < 0 ? 'under' : 'over'}.
            The stored HST and MAT are what is <strong>owed</strong>. Nothing is being split by guesswork.
          </div>
        )}
      </div>

      {/* OVERLAPS */}
      <div style={{
        background: hasOverlap ? L.redWash : 'transparent', border: `1px solid ${hasOverlap ? L.redLine : L.line}`,
        borderRadius: '12px', padding: '14px 16px', fontSize: '13px',
      }}>
        <span style={microLabel}>Dates</span>
        <div style={{ marginTop: '6px' }}>
          {hasOverlap
            ? <span style={{ color: L.red }}>
                Overlaps {preview.overlaps.length} existing booking{preview.overlaps.length > 1 ? 's' : ''}:{' '}
                {preview.overlaps.map((o: any) => o.label).join('; ')}. Creating this makes a second, separate booking.
              </span>
            : <span style={{ color: L.inkBody }}>No conflicting booking on these dates.</span>}
        </div>
      </div>

      {/* SIDE EFFECTS */}
      {preview.expenses.length > 0 && (
        <div style={{ background: L.cardAlt, borderRadius: '12px', padding: '14px 16px' }}>
          <span style={microLabel}>Also creates</span>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '8px', cursor: 'pointer', fontSize: '13px', lineHeight: 1.5 }}>
            <input type="checkbox" checked={createExpenses} onChange={e => setCreateExpenses(e.target.checked)} style={{ marginTop: '3px' }} />
            <span>
              {preview.expenses.length} expense{preview.expenses.length > 1 ? 's' : ''} for the platform fees
              <span style={{ display: 'block', color: L.inkMuted, fontSize: '12px', marginTop: '3px' }}>
                {preview.expenses.map((e: any) => `${e.description} ${money(e.amount)}`).join(' · ')} — Management &amp; administration fees, unconfirmed.
                {!createExpenses && ' Unticked: no expense will be created.'}
              </span>
            </span>
          </label>
        </div>
      )}

      {/* EDIT */}
      {editing && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '10px' }}>
          {FIELDS.map(([k, label, type]) => (
            <div key={k}>
              <div style={microLabel}>{label}</div>
              <input type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
                value={draft[k] ?? ''} step={type === 'number' ? '0.01' : undefined}
                onChange={e => onEdit({ [k]: e.target.value })} style={{ ...inp, marginTop: '4px' }} />
            </div>
          ))}
        </div>
      )}

      {err && <span style={{ fontSize: '13px', color: L.red }}>{err}</span>}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {mi ? (<>
          <button onClick={() => onConfirm({ createExpenses, ids, mode: 'merge', targetId: mi.id })} disabled={busy || mi.changes.length === 0}
            style={{ padding: '12px 20px', borderRadius: '10px', background: mi.changes.length ? L.ink : L.line, color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: mi.changes.length ? 'pointer' : 'not-allowed', fontFamily: F.sans, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Filling in…' : 'Fill in this booking'}
          </button>
          <button onClick={() => onConfirm({ createExpenses, ids, mode: 'create' })} disabled={busy}
            style={{ padding: '12px 18px', borderRadius: '10px', background: 'transparent', border: `1px solid ${L.line}`, fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: F.sans }}>
            Create separate
          </button>
        </>) : (
          <button onClick={() => onConfirm({ createExpenses, ids, mode: 'create' })} disabled={busy}
            style={{ padding: '12px 20px', borderRadius: '10px', background: L.ink, color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: F.sans, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Creating…' : 'Create the booking'}
          </button>
        )}
        <button onClick={() => setEditing(v => !v)} disabled={busy}
          style={{ padding: '12px 18px', borderRadius: '10px', background: 'transparent', border: `1px solid ${L.line}`, fontSize: '14px', cursor: 'pointer', fontFamily: F.sans }}>
          {editing ? 'Done editing' : 'Edit fields'}
        </button>
        <button onClick={onCancel} disabled={busy}
          style={{ padding: '12px 18px', borderRadius: '10px', background: 'transparent', border: 'none', color: L.inkMuted, fontSize: '14px', cursor: 'pointer', fontFamily: F.sans }}>
          Discard
        </button>
      </div>
    </div>
  )
}
