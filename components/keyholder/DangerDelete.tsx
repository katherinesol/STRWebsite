'use client'
import { useState } from 'react'
import { L, F, money } from '@/lib/design-tokens'

/*  A destructive action that says what it will destroy.
 *
 *  Both delete endpoints are two-step: without confirm=true they report what
 *  WOULD go and touch nothing. This asks for that report first and puts the real
 *  numbers in the question, because "Delete?" asks someone to agree to a word,
 *  not to a consequence. An invoice delete cascades to line items, adjustments,
 *  payments and the expenses those payments filed — four kinds of row, none of
 *  them visible in the button.
 *
 *  The confirm is deliberately not the easy action: it is not autofocused, it is
 *  not the form default, and Enter does nothing. Cancel is the resting state.
 *  Deleting money records should take a decision, not a reflex. */

export default function DangerDelete({ previewUrl, confirmUrl, label, describe, onDone }: {
  previewUrl: string
  confirmUrl: string
  label: string
  describe: (preview: any) => { question: string; lines: string[]; warning?: string | null }
  onDone: () => void
}) {
  const [preview, setPreview] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function ask() {
    setBusy(true); setErr('')
    try {
      const res = await fetch(previewUrl, { method: 'DELETE' })
      const j = await res.json()
      if (!res.ok) { setErr(j.error || 'Could not read what this would delete'); return }
      setPreview(j)
    } catch { setErr('Could not read what this would delete') }
    finally { setBusy(false) }
  }

  async function go() {
    setBusy(true); setErr('')
    try {
      const res = await fetch(confirmUrl, { method: 'DELETE' })
      const j = await res.json()
      if (!res.ok) { setErr(j.error || 'Could not delete'); return }
      setPreview(null); onDone()
    } catch { setErr('Could not delete') }
    finally { setBusy(false) }
  }

  if (!preview) {
    return (
      <>
        <button onClick={ask} disabled={busy} title={label}
          style={{ background: 'none', border: 'none', color: L.inkFaint, cursor: busy ? 'wait' : 'pointer', fontSize: '15px', padding: '2px 6px', lineHeight: 1 }}>
          {busy ? '…' : '✕'}
        </button>
        {err && <span style={{ fontSize: '12px', color: L.red }}>{err}</span>}
      </>
    )
  }

  const d = describe(preview)
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'oklch(0.25 0.01 60 / 0.45)', zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
    }}>
      <div style={{ background: L.card, borderRadius: '14px', padding: '24px', maxWidth: '470px', width: '100%', border: `1px solid ${L.line}` }}>
        <div style={{ fontFamily: F.serif, fontSize: '22px', lineHeight: 1.25, color: L.ink, marginBottom: '12px' }}>
          {d.question}
        </div>
        <ul style={{ margin: '0 0 14px', paddingLeft: '18px', fontSize: '14px', color: L.inkBody, lineHeight: 1.6 }}>
          {d.lines.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
        {d.warning && (
          <div style={{ background: L.amberWash, border: `1px solid ${L.amberLine}`, borderRadius: '9px', padding: '11px 13px', fontSize: '13px', color: L.inkBody, lineHeight: 1.55, marginBottom: '14px' }}>
            {d.warning}
          </div>
        )}
        <div style={{ fontSize: '13px', color: L.inkFaint, marginBottom: '16px' }}>This cannot be undone.</div>
        {err && <div style={{ fontSize: '13px', color: L.red, marginBottom: '10px' }}>{err}</div>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          {/* cancel is the resting action; confirm is never the default */}
          <button autoFocus onClick={() => { setPreview(null); setErr('') }}
            style={{ padding: '9px 16px', borderRadius: '99px', fontSize: '14px', cursor: 'pointer', fontFamily: F.sans, background: L.card, color: L.ink, border: `1px solid ${L.line}` }}>
            Keep it
          </button>
          <button onClick={go} disabled={busy}
            style={{ padding: '9px 16px', borderRadius: '99px', fontSize: '14px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: F.sans, background: L.red, color: '#fff', border: 'none' }}>
            {busy ? 'Deleting…' : label}
          </button>
        </div>
      </div>
    </div>
  )
}

export const plural = (n: number, one: string, many?: string) => `${n} ${n === 1 ? one : (many || one + 's')}`
export const m = money
