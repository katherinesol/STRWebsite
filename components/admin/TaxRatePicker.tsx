'use client'
import { L, F, microLabel, money } from '@/lib/design-tokens'

/*  The tax on an invoice: a rate you pick, not an amount you type.
 *
 *  ONE implementation, used when creating an invoice and when editing one, so
 *  the two cannot compute differently. Typing a dollar figure is how a wrong rate
 *  gets in and stays in — the reconciliation found 11% charged where 13% was due,
 *  and once it is only a number there is nothing left to notice.
 *
 *  THE BASE. HST is charged on the pre-tax amount actually billed: the line items
 *  less anything held back. Never on a total that already contains tax. Getting
 *  that base wrong is precisely the error the reconciliation spent a week undoing,
 *  so the arithmetic is shown rather than asserted.
 *
 *      subtotal = Σ items − Σ deductions
 *      HST      = rate × subtotal
 *      total    = subtotal + HST
 *
 *  The MODE is stored beside the amount. Without it the column default 'auto'
 *  applied to everything, and a stored 0 then disagreed with a screen that
 *  recomputed 13% — which is exactly what Gas Line and Solid Waste did. */

export type TaxMode = 'auto' | 'none' | 'manual'

export function computeHst(mode: TaxMode, subtotal: number, rate: number, manualAmount: number): number {
  const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100
  if (mode === 'none') return 0
  if (mode === 'manual') return r2(manualAmount || 0)
  return r2(subtotal * ((rate || 0) / 100))
}

export default function TaxRatePicker({
  mode, rate, manualAmount, subtotal, onChange,
}: {
  mode: TaxMode
  rate: string
  manualAmount: string
  subtotal: number
  onChange: (next: { mode: TaxMode; rate: string; manualAmount: string }) => void
}) {
  const hst = computeHst(mode, subtotal, Number(rate), Number(manualAmount))
  const pill = (on: boolean): React.CSSProperties => ({
    padding: '7px 13px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer', fontFamily: F.sans,
    fontWeight: on ? 600 : 400,
    background: on ? L.ink : L.card, color: on ? '#fff' : L.ink,
    border: on ? '1px solid transparent' : `1px solid ${L.line}`,
  })
  const inp: React.CSSProperties = {
    padding: '7px 10px', fontSize: '13px', border: `1px solid ${L.line}`,
    borderRadius: '7px', background: L.card, color: L.ink, fontFamily: 'inherit',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
      <div style={microLabel}>Tax</div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        {([['auto', 'HST 13%'], ['none', 'No tax / exempt'], ['manual', 'Enter the amount']] as const).map(([m, label]) => (
          <button key={m} type="button" style={pill(mode === m)}
            onClick={() => onChange({ mode: m, rate: m === 'auto' ? (rate || '13') : rate, manualAmount })}>
            {label}
          </button>
        ))}
        {mode === 'auto' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: L.inkBody }}>
            at
            <input value={rate} inputMode="decimal" style={{ ...inp, width: '68px', textAlign: 'right' }}
              onChange={e => onChange({ mode, rate: e.target.value.replace(/[^\d.]/g, ''), manualAmount })} />
            %
          </span>
        )}
        {mode === 'manual' && (
          <input type="number" value={manualAmount} placeholder="0.00" min="0" step="0.01"
            style={{ ...inp, width: '120px' }}
            onChange={e => onChange({ mode, rate, manualAmount: e.target.value })} />
        )}
      </div>
      <span style={{ fontSize: '13px', color: L.inkMuted }}>
        {mode === 'none' ? 'No tax on this invoice.'
          : mode === 'manual' ? 'Typed straight in — use this only when the invoice states an amount that no rate reproduces.'
            : <>{money(subtotal)} &times; {Number(rate) || 0}% = <strong style={{ color: L.ink }}>{money(hst)}</strong> — charged on the subtotal after deductions, never on a total that already includes tax.</>}
      </span>
    </div>
  )
}
