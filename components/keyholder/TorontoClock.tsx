'use client'
import { useState, useEffect } from 'react'
import { L, F, microLabel } from '@/lib/design-tokens'

/** The date and a running clock, both in Toronto.
 *
 *  The server renders the date so there is no flash of the wrong day, and the
 *  time starts ticking once the browser takes over. Rendering the time on the
 *  server would freeze it at page load and quietly go stale. */
export default function TorontoClock({ weekday, month, day }: { weekday: string; month: string; day: number }) {
  const [time, setTime] = useState<string | null>(null)
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-CA', {
      timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{ ...microLabel, display: 'flex', alignItems: 'baseline', gap: '10px' }}>
      <span>{weekday}, {month} {day} · Toronto</span>
      <span style={{ fontFamily: F.mono, color: L.inkMuted, fontVariantNumeric: 'tabular-nums' }}>
        {time ?? ' '}
      </span>
    </span>
  )
}
