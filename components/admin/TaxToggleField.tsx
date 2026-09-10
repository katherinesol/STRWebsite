'use client'
import { taxToggleExplainer, type BookingSource } from '@/lib/booking-tax'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

// Shared apply-tax control for both booking editors, so the rule can't drift.
export default function TaxToggleField({
  applyTax, note, source, platform, onToggle, onNoteChange,
}: {
  applyTax: boolean
  note: string
  source: BookingSource
  platform?: string | null
  onToggle: (v: boolean) => void
  onNoteChange: (v: string) => void
}) {
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', width: 'fit-content' }}>
        <div style={{ width: '32px', height: '18px', borderRadius: '9px', background: applyTax ? 'var(--amber)' : '#4A4A48', position: 'relative', flexShrink: 0, transition: 'background .2s' }}>
          <div style={{ position: 'absolute', top: '2px', left: applyTax ? '16px' : '2px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
        </div>
        <input type="checkbox" checked={applyTax} onChange={e => onToggle(e.target.checked)} style={{ display: 'none' }} />
        <span style={{ fontSize: '13px', color: '#F5F2EC' }}>{applyTax ? 'Tax applies' : 'No tax'}</span>
      </label>

      <div style={{ fontSize: '11px', color: '#9A9A92', lineHeight: 1.45, marginTop: '6px' }}>
        {taxToggleExplainer(applyTax, source, platform)}
      </div>

      <input
        type="text"
        value={note}
        onChange={e => onNoteChange(e.target.value)}
        placeholder="Why tax is / isn't applied (optional)"
        maxLength={300}
        style={{ ...inputStyle, marginTop: '8px' }}
      />
    </div>
  )
}
