'use client'
import { useEffect, useRef, useState } from 'react'

export default function EscalationNotifier() {
  const [perm, setPerm] = useState<string>('default')
  const lastCount = useRef<number | null>(null)

  useEffect(() => {
    if (typeof Notification !== 'undefined') setPerm(Notification.permission)
  }, [])

  useEffect(() => {
    if (perm !== 'granted') return
    const check = async () => {
      try {
        const res = await fetch('/api/admin/inbox')
        const d = await res.json()
        const count = (d.conversations || []).filter((c: any) => c.unread).length
        if (lastCount.current !== null && count > lastCount.current) {
          const latest = (d.conversations || []).find((c: any) => c.unread)
          new Notification('New guest message', { body: `${latest?.guest_name || 'A guest'} — ${latest?.last_message_preview || 'needs your attention'}` })
        }
        lastCount.current = count
      } catch {}
    }
    check()
    const t = setInterval(check, 15000)
    return () => clearInterval(t)
  }, [perm])

  async function enable() {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission()
    setPerm(p)
    if (p === 'granted') new Notification('Alerts enabled', { body: 'You will be notified of new guest messages.' })
  }

  const base: React.CSSProperties = { position: 'fixed', bottom: '16px', right: '16px', padding: '8px 13px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', zIndex: 100, border: '0.5px solid #363634' }

  if (perm === 'granted') {
    return <div onClick={() => new Notification('Test alert', { body: 'Notifications are working. Switch to another tab to see them pop up.' })} style={{ ...base, background: '#1c2a1c', color: '#7bc47b', cursor: 'pointer' }} title="Alerts on — click to send a test">🔔 Alerts on</div>
  }
  if (perm === 'denied') {
    return <div style={{ ...base, background: '#2a1c1c', color: '#c47b7b', cursor: 'default' }} title="Blocked — enable in browser site settings">🔕 Alerts blocked</div>
  }
  return <button onClick={enable} style={{ ...base, background: '#242422', color: '#B8956B' }}>🔔 Enable guest alerts</button>
}
