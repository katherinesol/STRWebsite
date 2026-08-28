'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { L, F, microLabel, cardStyle } from '@/lib/design-tokens'

/*  The parts of a direct booking that are neither money nor dates: where the
 *  stay is in its life, what happened to the security deposit, and the link a
 *  guest uses to reach support. All three were on the legacy page only.
 *
 *  THE CANCEL HALF IS NOT HERE. CancelOrRefund owns it and does it properly -
 *  it reverses money and tax, frees dates and revokes codes. The legacy button
 *  just PATCHed status:'cancelled' and left the figures behind, so it is
 *  deliberately not reproduced.
 *
 *  MARKING COMPLETED HAS ONE REAL CONSEQUENCE, and it is easy to miss: the iCal
 *  feed publishes status in ('confirmed','active'), so a completed booking drops
 *  out of it and the platforms free those dates on their next fetch. That is
 *  right for a stay that has ended and wrong while a guest is still in the
 *  house, so it is warned about rather than silently done.
 *
 *  THE SECURITY DEPOSIT IS A MARKER, NOT MONEY - established by reading the
 *  schema rather than assumed. bookings has no security_deposit_amount column
 *  (the figure lives on property_settings), stripe_deposit_id is referenced by
 *  zero files, and all four bookings sit at 'none' with no hold. Nothing is
 *  charged, held or returned, so recording released/claimed creates no
 *  money-outside-the-ledger the way a timestamp-only deposit did. If a claim is
 *  ever actually collected, that money is income and goes in as a damage
 *  recovery on the Accounts surface - the path Heremela's $2,464.57 took. */

const inputStyle: any = { width: '100%', padding: '9px 11px', borderRadius: '8px', border: `1px solid ${L.line}`, background: L.cardAlt, color: L.ink, fontSize: '14px', marginTop: '4px' }
const btn = (primary?: boolean): any => ({
  padding: '8px 13px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
  border: `1px solid ${primary ? L.ink : L.line}`,
  background: primary ? L.ink : 'transparent', color: primary ? L.card : L.inkFaint,
})

async function patchBooking(id: string, body: any) {
  const res = await fetch(`/api/admin/bookings/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error([j.error, j.detail].filter(Boolean).join(' ') || 'Could not save')
  return j
}

/* ── #14 ─────────────────────────────────────────────────────────────────── */
export function StayStatus({ bookingId, status, checkOut }: { bookingId: string; status: string; checkOut: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const ended = !checkOut || checkOut <= today

  async function go(next: 'active' | 'completed') {
    if (next === 'completed' && !ended &&
      !confirm(`This stay runs to ${checkOut}. Marking it completed drops it from the iCal feed, so the platforms will free these dates. Continue?`)) return
    setBusy(next); setErr('')
    try { await patchBooking(bookingId, { status: next }); router.refresh() }
    catch (e: any) { setErr(e.message) } finally { setBusy('') }
  }
  if (status === 'cancelled' || status === 'completed') return null

  return (
    <div style={{ ...cardStyle, padding: '18px 20px' }}>
      <div style={{ ...microLabel, marginBottom: '10px' }}>Stay status</div>
      <div style={{ fontSize: '13px', color: L.inkMuted, marginBottom: '10px' }}>
        Currently <strong style={{ color: L.ink }}>{status}</strong>.
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {status !== 'active' && (
          <button onClick={() => go('active')} disabled={!!busy} style={btn()}>
            {busy === 'active' ? '…' : 'Guest checked in'}
          </button>
        )}
        <button onClick={() => go('completed')} disabled={!!busy} style={btn()}>
          {busy === 'completed' ? '…' : 'Guest checked out'}
        </button>
      </div>
      {!ended && (
        <div style={{ fontSize: '12px', color: L.inkFaint, marginTop: '8px', lineHeight: 1.5 }}>
          Completing before {checkOut} drops this from the iCal feed and frees the dates on the platforms.
        </div>
      )}
      {err && <div style={{ fontSize: '12.5px', color: L.red, marginTop: '8px' }}>{err}</div>}
    </div>
  )
}

/* ── #15 ─────────────────────────────────────────────────────────────────── */
export function SecurityDeposit({ bookingId, current }: { bookingId: string; current: string | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const value = current || 'none'

  async function set(next: 'held' | 'released' | 'claimed' | 'none') {
    setBusy(next); setErr('')
    try { await patchBooking(bookingId, { security_deposit_status: next }); router.refresh() }
    catch (e: any) { setErr(e.message) } finally { setBusy('') }
  }
  return (
    <div style={{ ...cardStyle, padding: '18px 20px' }}>
      <div style={{ ...microLabel, marginBottom: '10px' }}>Security deposit</div>
      <div style={{ fontSize: '13px', color: L.inkMuted, marginBottom: '10px' }}>
        Currently <strong style={{ color: L.ink }}>{value}</strong>.
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {(['held', 'released', 'claimed'] as const).filter(v => v !== value).map(v => (
          <button key={v} onClick={() => set(v)} disabled={!!busy} style={btn(v === 'released')}>
            {busy === v ? '…' : v === 'held' ? 'Mark held' : v === 'released' ? 'Release' : 'Claim'}
          </button>
        ))}
      </div>
      <div style={{ fontSize: '12px', color: L.inkFaint, marginTop: '8px', lineHeight: 1.5 }}>
        This records the outcome only — no money is held or charged here. If a claim is actually
        collected, record it as a damage recovery so it reaches the Accounts surface.
      </div>
      {err && <div style={{ fontSize: '12.5px', color: L.red, marginTop: '8px' }}>{err}</div>}
    </div>
  )
}

/* ── #18 ─────────────────────────────────────────────────────────────────── */
export function SupportLink({ code, siteUrl }: { code: string | null; siteUrl: string }) {
  const [copied, setCopied] = useState('')
  const url = `${siteUrl}/support`
  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text)
    setCopied(what); setTimeout(() => setCopied(''), 1500)
  }
  const Line = ({ label, value, what }: { label: string; value: string; what: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0' }}>
      <span style={{ fontSize: '12px', color: L.inkMuted, width: '92px' }}>{label}</span>
      <span style={{ fontSize: '13px', color: L.ink, fontFamily: F.mono, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
      <button onClick={() => copy(value, what)} style={{ background: 'none', border: 'none', color: L.inkFaint, fontSize: '11px', cursor: 'pointer' }}>
        {copied === what ? '✓' : 'copy'}
      </button>
    </div>
  )
  return (
    <div style={{ ...cardStyle, padding: '18px 20px' }}>
      <div style={{ ...microLabel, marginBottom: '8px' }}>Guest support</div>
      <Line label="Link" value={url} what="link" />
      <Line label="Code" value={code || '— none set —'} what="code" />
      <div style={{ fontSize: '12px', color: L.inkFaint, marginTop: '8px', lineHeight: 1.5 }}>
        The guest enters this code and their surname at the support page to chat about their stay.
      </div>
    </div>
  )
}
