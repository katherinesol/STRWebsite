'use client'
import { TRIP_PURPOSE_OPTIONS, isOther } from '@/lib/trip-purposes'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

// Shared purpose control for both admin booking editors (direct + platform),
// so the two never drift apart. Guest-visible data — gift notes are separate
// and admin-only.
export default function TripPurposeField({
  purpose, note, onPurposeChange, onNoteChange,
}: {
  purpose: string
  note: string
  onPurposeChange: (v: string) => void
  onNoteChange: (v: string) => void
}) {
  return (
    <div>
      <select
        value={purpose}
        onChange={e => {
          const v = e.target.value
          onPurposeChange(v)
          if (!isOther(v)) onNoteChange('')   // drop stale note when leaving "Other"
        }}
        style={{ ...inputStyle, background: '#363634' }}
      >
        <option value="">Not set</option>
        {TRIP_PURPOSE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      {isOther(purpose) && (
        <input
          type="text"
          value={note}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="Occasion"
          maxLength={200}
          style={{ ...inputStyle, marginTop: '6px' }}
        />
      )}
    </div>
  )
}
