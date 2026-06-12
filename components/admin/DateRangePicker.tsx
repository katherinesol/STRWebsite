'use client'
import { useState } from 'react'

type Busy = { start: string; end: string }

function toStr(d: Date) {
  return d.toISOString().split('T')[0]
}

export default function DateRangePicker({ busy, checkIn, checkOut, onChange }: {
  busy: Busy[]
  checkIn: string
  checkOut: string
  onChange: (checkIn: string, checkOut: string) => void
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date(); d.setDate(1); return d
  })

  const todayStr = toStr(new Date())

  function isBusy(dateStr: string) {
    // a date is busy if any range covers it as a NIGHT (start <= date < end)
    return busy.some(b => dateStr >= b.start && dateStr < b.end)
  }

  function handleClick(dateStr: string) {
    if (isBusy(dateStr) || dateStr < todayStr) return
    if (!checkIn || (checkIn && checkOut)) {
      onChange(dateStr, '')
    } else if (dateStr > checkIn) {
      // verify no busy night inside the range
      const hasConflict = busy.some(b => checkIn < b.end && dateStr > b.start)
      if (hasConflict) { onChange(dateStr, ''); return }
      onChange(checkIn, dateStr)
    } else {
      onChange(dateStr, '')
    }
  }

  const year = month.getFullYear()
  const m = month.getMonth()
  const firstDow = new Date(year, m, 1).getDay()
  const daysInMonth = new Date(year, m + 1, 0).getDate()
  const cells: (string | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => toStr(new Date(Date.UTC(year, m, i + 1)))),
  ]

  return (
    <div style={{ background: '#1E1E1C', border: '0.5px solid #363634', padding: '14px', marginTop: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <button onClick={() => setMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          style={{ background: 'none', border: 'none', color: '#9A9A92', cursor: 'pointer', fontSize: '14px' }}>←</button>
        <div style={{ fontSize: '12px', color: '#F5F2EC', letterSpacing: '.08em', textTransform: 'uppercase' }}>
          {month.toLocaleString('en-CA', { month: 'long', year: 'numeric' })}
        </div>
        <button onClick={() => setMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          style={{ background: 'none', border: 'none', color: '#9A9A92', cursor: 'pointer', fontSize: '14px' }}>→</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} style={{ fontSize: '9px', color: '#666660', textAlign: 'center', padding: '4px 0' }}>{d}</div>
        ))}
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={i} />
          const busyDay = isBusy(dateStr)
          const past = dateStr < todayStr
          const selected = dateStr === checkIn || dateStr === checkOut
          const inRange = checkIn && checkOut && dateStr > checkIn && dateStr < checkOut
          const dayNum = parseInt(dateStr.slice(8))
          return (
            <button key={i} onClick={() => handleClick(dateStr)} disabled={busyDay || past}
              style={{
                padding: '7px 0', fontSize: '12px', fontFamily: 'var(--sans)',
                background: selected ? 'var(--amber)' : inRange ? '#3a3326' : busyDay ? '#2a1518' : 'transparent',
                color: selected ? '#1A1A18' : busyDay ? '#5a3a3e' : past ? '#444440' : '#F5F2EC',
                border: 'none', cursor: busyDay || past ? 'not-allowed' : 'pointer',
                textDecoration: busyDay ? 'line-through' : 'none', borderRadius: '2px',
              }}>
              {dayNum}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: '10px', color: '#666660', marginTop: '8px' }}>
        Struck-out dates are booked or blocked. {checkIn && !checkOut ? 'Now pick check-out.' : ''}
      </div>
    </div>
  )
}
