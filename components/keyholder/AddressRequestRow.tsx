'use client'
import { useState } from 'react'
import { L } from '@/lib/design-tokens'

/*  A guest asking for the exact address before the 24-hour auto-reveal.
 *
 *  This is the one row in Today that ACTS rather than links. Every other alert
 *  sends you to a page to do the thing; approving an address is one decision with
 *  two outcomes and no context to gather, so making it a round trip would be
 *  worse. It is a client component for exactly that reason.
 *
 *  THE DECISION IS SOFTER THAN IT LOOKS, and the copy says so. Denying does not
 *  withhold the address — at T-24h it appears regardless. It means "not yet", and
 *  the guest is never shown the word. */

export default function AddressRequestRow({ req, first }: {
  req: {
    booking_id: string
    booking_kind: 'platform' | 'direct'
    guest: string
    property: string
    checkIn: string
    daysAway: number
  }
  first: boolean
}) {
  const [state, setState] = useState<'open' | 'saving' | 'approved' | 'denied' | 'error'>('open')

  async function decide(decision: 'approved' | 'denied') {
    setState('saving')
    const res = await fetch('/api/keyholder/address-request', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: req.booking_id, booking_kind: req.booking_kind, decision }),
    })
    setState(res.ok ? decision : 'error')
  }

  const btn = (bg: string, fg: string) => ({
    padding: '7px 15px', borderRadius: '8px', border: 'none', cursor: 'pointer',
    fontSize: '13px', fontWeight: 600, background: bg, color: fg, flex: 'none' as const,
  })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '16px', padding: '17px 22px',
      borderTop: first ? 'none' : `1px solid ${L.lineFaint}`, flexWrap: 'wrap',
    }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: L.amber, flex: 'none' }} />
      <span style={{ fontSize: '15px' }}>
        {req.guest} has asked for the address, {req.daysAway} day{req.daysAway === 1 ? '' : 's'} before arriving.
      </span>
      <span style={{ fontSize: '13px', color: L.inkMuted }}>
        {req.property} · {req.checkIn} · it shows on its own 24h before
      </span>

      <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center', flex: 'none' }}>
        {state === 'open' && (
          <>
            <button onClick={() => decide('denied')} style={btn(L.card, L.inkBody)}>Not yet</button>
            <button onClick={() => decide('approved')} style={btn(L.ink, '#fff')}>Share it</button>
          </>
        )}
        {state === 'saving' && <span style={{ fontSize: '13px', color: L.inkMuted }}>Saving…</span>}
        {state === 'approved' && <span style={{ fontSize: '13px', fontWeight: 600, color: L.ink }}>Shared — they can see it now</span>}
        {state === 'denied' && <span style={{ fontSize: '13px', color: L.inkMuted }}>Not yet — shows 24h before anyway</span>}
        {state === 'error' && <span style={{ fontSize: '13px', fontWeight: 600, color: L.red }}>Didn&apos;t save — try again</span>}
      </span>
    </div>
  )
}
