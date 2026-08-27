'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { L, F, microLabel, money } from '@/lib/design-tokens'

/*  Cancel or refund, in the DangerDelete discipline.
 *
 *  THE FIRST QUESTION IS NOT THE AMOUNT. "Did the guest stay?" is asked before
 *  anything else and answered explicitly, because the same figure means opposite
 *  things: a guest who never arrived should lose their dates and their door
 *  code, a guest who stayed and was given money back must keep both. There is no
 *  default on that question and no way past it.
 *
 *  THE PREVIEW IS THE POINT. It comes from the server, names every consequence
 *  with real figures — money reversed, tax reversed and by whom, whether the
 *  dates actually reopen, whether a code is revoked, what the status becomes —
 *  and only then offers the confirm. It also carries the fingerprint, which the
 *  confirm echoes: a booking edited in another tab produces a different one and
 *  the write is refused rather than applied to numbers nobody read.
 *
 *  "Keep it" is the resting action. It is the wide button, it is what Escape
 *  does, and the destructive one is never focused and never the form default. */

type Props = { bookingId: string; kind: 'direct' | 'platform'; guest: string; accounts: any[] }

export default function CancelOrRefund({ bookingId, kind, guest, accounts }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [stayed, setStayed] = useState<boolean | null>(null)
  const [mode, setMode] = useState<'full' | 'partial' | 'none'>('full')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const [accountId, setAccountId] = useState('')
  const [reference, setReference] = useState('')
  const [preview, setPreview] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  function reset() {
    setOpen(false); setStayed(null); setMode('full'); setAmount(''); setReason('')
    setPreview(null); setErr(''); setReference('')
  }

  async function send(confirm?: string) {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/bookings/cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId, booking_kind: kind, stayed, mode,
          amount: amount === '' ? undefined : Number(amount),
          reason: reason || undefined,
          ...(confirm ? { confirm, paid_at: paidAt, account_id: accountId || undefined, reference: reference || undefined } : {}),
        }),
      })
      const j = await res.json()
      if (!res.ok) {
        setErr([j.error, j.detail].filter(Boolean).join(' '))
        // a 409 from a stale fingerprint returns the fresh plan — show it
        if (j.fingerprint_now) setPreview(j)
        return
      }
      if (confirm) { reset(); router.refresh() } else setPreview(j)
    } catch { setErr('Could not reach the server') }
    finally { setBusy(false) }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ background: 'none', border: `1px solid ${L.line}`, borderRadius: '8px',
                 color: L.inkFaint, cursor: 'pointer', fontSize: '13px', padding: '7px 12px' }}>
        Cancel or refund
      </button>
    )
  }

  const Shell = ({ children }: { children: any }) => (
    <div onKeyDown={e => { if (e.key === 'Escape') reset() }}
      style={{ position: 'fixed', inset: 0, background: 'oklch(0.25 0.01 60 / 0.45)', zIndex: 60,
               display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: L.card, borderRadius: '14px', padding: '24px', maxWidth: '540px',
                    width: '100%', maxHeight: '85vh', overflowY: 'auto', border: `1px solid ${L.line}` }}>
        {children}
      </div>
    </div>
  )

  /* ── step 1: the question that decides everything ───────────────────────── */
  if (stayed === null) {
    return (
      <Shell>
        <div style={{ fontFamily: F.serif, fontSize: '22px', lineHeight: 1.25, color: L.ink, marginBottom: '6px' }}>
          Did {guest || 'the guest'} stay?
        </div>
        <p style={{ fontSize: '13px', color: L.inkFaint, lineHeight: 1.55, margin: '0 0 18px' }}>
          This decides everything else. It is never worked out from the amount — the same figure
          means opposite things depending on the answer.
        </p>
        <div style={{ display: 'grid', gap: '10px' }}>
          <button onClick={() => { setStayed(false); setMode('full') }}
            style={{ textAlign: 'left', padding: '14px 16px', borderRadius: '10px', cursor: 'pointer',
                     border: `1px solid ${L.line}`, background: L.cardAlt }}>
            <div style={{ fontSize: '14px', color: L.ink, marginBottom: '3px' }}>No — they never stayed</div>
            <div style={{ fontSize: '12px', color: L.inkFaint, lineHeight: 1.5 }}>
              Cancels the booking. Dates reopen, the door code is revoked, money and tax reverse.
            </div>
          </button>
          <button onClick={() => { setStayed(true); setMode('partial') }}
            style={{ textAlign: 'left', padding: '14px 16px', borderRadius: '10px', cursor: 'pointer',
                     border: `1px solid ${L.line}`, background: L.cardAlt }}>
            <div style={{ fontSize: '14px', color: L.ink, marginBottom: '3px' }}>Yes — goodwill refund</div>
            <div style={{ fontSize: '12px', color: L.inkFaint, lineHeight: 1.5 }}>
              The stay stands. Dates unchanged, code untouched, only money moves.
            </div>
          </button>
        </div>
        <button onClick={reset} style={keepStyle}>Keep it as it is</button>
      </Shell>
    )
  }

  /* ── step 2: how much, and why ──────────────────────────────────────────── */
  if (!preview) {
    return (
      <Shell>
        <div style={{ fontFamily: F.serif, fontSize: '20px', color: L.ink, marginBottom: '14px' }}>
          {stayed ? 'Goodwill refund' : 'Cancelling'} — {guest || 'this booking'}
        </div>
        {!stayed && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            {([['full', 'Refund everything'], ['partial', 'Keep a fee'], ['none', 'No money moves']] as const).map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)}
                style={{ padding: '7px 12px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
                         border: `1px solid ${mode === m ? L.ink : L.line}`,
                         background: mode === m ? L.ink : 'transparent', color: mode === m ? L.card : L.inkFaint }}>
                {label}
              </button>
            ))}
          </div>
        )}
        {(stayed || mode === 'partial') && (
          <label style={{ display: 'block', marginBottom: '14px' }}>
            <span style={microLabel}>{stayed ? 'Refund amount (off the room)' : 'Fee you are keeping'}</span>
            <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00"
              style={inputStyle} />
          </label>
        )}
        {!stayed && (
          <label style={{ display: 'block', marginBottom: '14px' }}>
            <span style={microLabel}>Reason</span>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this cancelled?"
              style={inputStyle} />
          </label>
        )}
        {err && <p style={errStyle}>{err}</p>}
        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
          <button onClick={() => send()} disabled={busy}
            style={{ ...secondaryStyle, opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Working it out…' : 'Show me what this does'}
          </button>
        </div>
        <button onClick={reset} style={keepStyle}>Keep it as it is</button>
      </Shell>
    )
  }

  /* ── step 3: every consequence, then confirm ────────────────────────────── */
  const p = preview
  const rows: [string, string][] = []
  if (p.money) rows.push(['Money', p.money.label + (p.money.cash_out ? ` Cash out ${money(p.money.cash_out)} — ${p.money.cash_out_explained}.` : '')])
  if (p.money?.tax_reversed_total > 0) {
    rows.push(['Tax', `HST ${money(p.money.hst.before)} → ${money(p.money.hst.after)}, MAT ${money(p.money.mat.before)} → ${money(p.money.mat.after)}. You reverse ${money(p.money.you_reverse)}.`])
    rows.push(['MAT return', p.money.mat_return_effect])
  }
  rows.push(['Dates', p.dates.message])
  rows.push(['Door code', p.locks.message])
  rows.push(['Status', p.status.message])

  return (
    <Shell>
      <div style={{ fontFamily: F.serif, fontSize: '21px', lineHeight: 1.25, color: L.ink, marginBottom: '4px' }}>
        {p.answer}
      </div>
      <p style={{ fontSize: '12px', color: L.inkFaint, margin: '0 0 16px' }}>
        {p.booking.guest} · {p.booking.platform} · {p.booking.check_in} → {p.booking.check_out}
      </p>
      <div style={{ display: 'grid', gap: '10px', marginBottom: '16px' }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: '10px', alignItems: 'start' }}>
            <span style={microLabel}>{k}</span>
            <span style={{ fontSize: '13px', color: L.ink, lineHeight: 1.55 }}>{v}</span>
          </div>
        ))}
      </div>
      {p.money?.airbnb_mat_flag && <p style={flagStyle}>{p.money.airbnb_mat_flag}</p>}
      {p.toronto_mat_caveat && <p style={flagStyle}>{p.toronto_mat_caveat}</p>}

      {p.money?.cash_out > 0 && (
        <div style={{ display: 'grid', gap: '10px', margin: '4px 0 14px' }}>
          <label><span style={microLabel}>Paid on</span>
            <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} style={inputStyle} /></label>
          <label><span style={microLabel}>From which account</span>
            <select value={accountId} onChange={e => setAccountId(e.target.value)} style={inputStyle}>
              <option value="">Choose an account…</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ···{a.last4}</option>)}
            </select></label>
          <label><span style={microLabel}>Reference (optional)</span>
            <input value={reference} onChange={e => setReference(e.target.value)} style={inputStyle} /></label>
        </div>
      )}
      {err && <p style={errStyle}>{err}</p>}

      <button onClick={reset} style={{ ...keepStyle, marginTop: 0, marginBottom: '10px' }}>Keep it as it is</button>
      <button onClick={() => send(p.fingerprint)} disabled={busy || (p.money?.cash_out > 0 && !accountId)}
        style={{ ...dangerStyle, opacity: busy || (p.money?.cash_out > 0 && !accountId) ? 0.45 : 1 }}>
        {busy ? 'Recording…' : p.status.to === 'cancelled' ? 'Yes, cancel this booking' : 'Yes, record this refund'}
      </button>
    </Shell>
  )
}

const inputStyle: any = { width: '100%', padding: '9px 11px', borderRadius: '8px', border: `1px solid ${L.line}`, background: L.cardAlt, color: L.ink, fontSize: '14px', marginTop: '4px' }
const keepStyle: any = { width: '100%', marginTop: '16px', padding: '11px', borderRadius: '9px', border: `1px solid ${L.line}`, background: L.cardAlt, color: L.ink, fontSize: '14px', cursor: 'pointer' }
const secondaryStyle: any = { flex: 1, padding: '11px', borderRadius: '9px', border: `1px solid ${L.ink}`, background: 'transparent', color: L.ink, fontSize: '14px', cursor: 'pointer' }
const dangerStyle: any = { width: '100%', padding: '11px', borderRadius: '9px', border: 'none', background: L.red, color: '#fff', fontSize: '14px', cursor: 'pointer' }
const errStyle: any = { fontSize: '13px', color: L.red, lineHeight: 1.5, margin: '0 0 12px' }
const flagStyle: any = { fontSize: '12.5px', color: L.ink, lineHeight: 1.55, background: L.cardAlt, border: `1px solid ${L.line}`, borderRadius: '9px', padding: '11px 13px', margin: '0 0 14px' }
