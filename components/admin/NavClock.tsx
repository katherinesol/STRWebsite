'use client'
import { useState, useEffect } from 'react'

export default function NavClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  if (!now) return null

  const time = now.toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
  const date = now.toLocaleDateString('en-US', { timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div style={{ padding: '10px 20px 14px', borderTop: '0.5px solid #2A2A28' }}>
      <div style={{ fontSize: '15px', color: '#F0EDE6', fontVariantNumeric: 'tabular-nums', letterSpacing: '.02em' }}>{time}</div>
      <div style={{ fontSize: '10px', color: '#666660', textTransform: 'uppercase', letterSpacing: '.1em', marginTop: '2px' }}>{date} · Toronto</div>
    </div>
  )
}
