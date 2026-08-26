'use client'
import { useState, useEffect } from 'react'
import { L, F, microLabel } from '@/lib/design-tokens'

/*  Which bank or card a payment came from.
 *
 *  ONE implementation, three callers. This began as inline markup on the invoice
 *  detail panel (restored in dc254ac after the redesign dropped it). Marking a
 *  scheduled payment paid never had it at all, which is how a billpay of $2,000
 *  reached the ledger with no detail on it — nobody could say which account it
 *  left from, and the payments migration had to ask. Copying the markup to fix
 *  that would have made two implementations to keep in step; this is the one.
 *
 *  The chips are the (method, detail, last4) triples already used, so the list
 *  is whatever you have actually paid with. Cash and cheque have nothing to name
 *  and the whole block hides for them.
 *
 *  These remain LABELS, not ledger accounts: "BMO …0377" identifies a payment to
 *  a person reading it. bank_accounts is the thing a statement can be matched
 *  against, and joining the two is the invoice read/write switch, not this. */

export const DETAILED = ['etransfer', 'billpay', 'card']

export default function MethodPicker({ method, detail, last4, onChange, compact }: {
  method: string
  detail: string
  last4: string
  onChange: (detail: string, last4: string) => void
  compact?: boolean
}) {
  const [methods, setMethods] = useState<any[]>([])
  useEffect(() => {
    fetch('/api/admin/invoices/vendors').then(r => r.json())
      .then(d => setMethods(d.methods || [])).catch(() => {})
  }, [])

  if (!DETAILED.includes(method)) return null

  const chips = methods.filter((m: any) => m.method === method && (m.method_detail || m.method_last4))

  return (
    <div>
      {!compact && <div style={microLabel}>Which {method === 'card' ? 'card' : 'bank'}</div>}
      {chips.length > 0 && (
        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginTop: compact ? 0 : '7px' }}>
          {chips.map((m: any, i: number) => {
            const on = detail === m.method_detail && last4 === m.method_last4
            return (
              <button key={i} type="button"
                onClick={() => onChange(m.method_detail || '', m.method_last4 || '')}
                style={{
                  padding: compact ? '5px 11px' : '7px 13px', borderRadius: '99px',
                  fontSize: compact ? '12px' : '13px', cursor: 'pointer', fontFamily: F.sans,
                  fontWeight: on ? 600 : 400,
                  background: on ? L.ink : L.card, color: on ? '#fff' : L.ink,
                  border: on ? '1px solid transparent' : `1px solid ${L.line}`,
                }}>
                {(m.method_detail || '—').trim()}{m.method_last4 ? ` ···${m.method_last4}` : ''}
              </button>
            )
          })}
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', marginTop: '7px' }}>
        <input value={detail} onChange={e => onChange(e.target.value, last4)}
          placeholder={method === 'card' ? 'Card name' : 'Bank'} style={inp} />
        <input value={last4} onChange={e => onChange(detail, e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="Last 4" inputMode="numeric" style={{ ...inp, maxWidth: '90px' }} />
      </div>
    </div>
  )
}

const inp: React.CSSProperties = {
  flex: 1, padding: '8px 11px', fontSize: '13px', border: `1px solid ${L.line}`,
  borderRadius: '7px', background: L.card, color: L.ink, fontFamily: 'inherit',
}
