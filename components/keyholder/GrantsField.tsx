'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { L, F, microLabel } from '@/lib/design-tokens'

/** Early check-in and late checkout, granted or refused.
 *
 *  These came off the calendar in Phase E of the calendar work — they were a
 *  modal there, which meant granting an hour required opening the month grid and
 *  finding the right cell. They belong on the booking.
 *
 *  Both columns are already in the allowlists on both PATCH endpoints, so this
 *  writes through the hardened path without needing anything new. A guest who
 *  did not ask gets no control at all — granting a late checkout nobody
 *  requested is how you end up holding a room for someone who left at eleven. */

export default function GrantsField({
  bookingId, kind, earlyGranted, lateGranted, earlyTime, lateTime,
}: {
  bookingId: string
  kind: 'direct' | 'platform'
  earlyGranted: boolean
  lateGranted: boolean
  earlyTime: string | null
  lateTime: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const endpoint = kind === 'direct'
    ? `/api/admin/bookings/${bookingId}`
    : `/api/admin/calendar/block/${bookingId}`

  async function set(column: string, value: boolean) {
    setBusy(column); setErr('')
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [column]: value }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error || 'Could not save'); return }
      router.refresh()
    } catch { setErr('Could not save') }
    finally { setBusy('') }
  }

  const rows: [string, string, boolean, string | null][] = [
    ['Early check-in', 'early_checkin_granted', earlyGranted, earlyTime],
    ['Late checkout', 'late_checkout_granted', lateGranted, lateTime],
  ]
  const chip = (on: boolean): React.CSSProperties => ({
    padding: '7px 13px', borderRadius: '99px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    fontFamily: F.sans, border: `1px solid ${on ? 'transparent' : L.line}`,
    background: on ? L.ink : L.card, color: on ? '#fff' : L.inkBody,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <span style={microLabel}>Early &amp; late</span>
      {rows.map(([label, column, granted, asked]) => (
        <div key={column} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '150px' }}>
            <span style={{ fontSize: '14px' }}>{label}</span>
            <span style={{ fontSize: '12px', color: L.inkMuted }}>
              {asked ? `asked for ${asked}` : 'not requested'}
            </span>
          </div>
          {asked ? (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '7px' }}>
              <button disabled={!!busy} onClick={() => set(column, true)} style={chip(granted)}>Granted</button>
              <button disabled={!!busy} onClick={() => set(column, false)} style={chip(!granted)}>Refused</button>
            </div>
          ) : (
            <span style={{ marginLeft: 'auto', fontSize: '12px', color: L.inkFaint }}>nothing to grant</span>
          )}
        </div>
      ))}
      {err && <span style={{ fontSize: '13px', color: L.red }}>{err}</span>}
    </div>
  )
}
