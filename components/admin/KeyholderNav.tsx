'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { L, F, container } from '@/lib/design-tokens'

// Top nav from the rebrand: five sections, not the thirty-item side rail.
// Assistant is the home for the AI/comms cluster — Haussy, Inbox, Knowledge, Concierge —
// which had nowhere to live under the original four.
export const SECTIONS = [
  { id: 'today', name: 'Today', href: '/keyholder' },
  { id: 'stays', name: 'Stays', href: '/keyholder/stays' },
  { id: 'money', name: 'Money', href: '/keyholder/money' },
  { id: 'property', name: 'Property', href: '/keyholder/property' },
  { id: 'people', name: 'People', href: '/keyholder/people' },
  { id: 'assistant', name: 'Assistant', href: '/keyholder/assistant' },
]

// LOCKS & ACCESS — restored 2026-08-25. The legacy side rail grouped these four
// under "Locks & Access" and the rebrand carried across five sections plus
// Assistant, none of which is where a lock belongs. So the group was not dropped
// on purpose, it simply had no home, and four owner-only screens became reachable
// only through the "Legacy admin" link in the corner — which is how the door log
// came to be reported as deleted when it had never been touched.
//
// They still point at /admin, because these four screens have not been rebuilt in
// the light shell. That is deliberate: a working dark screen you can reach beats a
// light one that does not exist yet. Repoint each href as it is rebuilt.
export const ACCESS_ITEMS = [
  { name: 'Locks', href: '/admin/locks', note: 'Codes and lock status' },
  { name: 'Door Activity', href: '/admin/door-activity', note: 'Every entry and check-in' },
  { name: 'Staff Access', href: '/admin/staff-access', note: 'Cleaner and contractor codes' },
  { name: 'System Activity', href: '/admin/system-log', note: 'Everything the system did' },
]

export default function KeyholderNav({ initial, role = 'cleaner' }: { initial: string; role?: string }) {
  const path = usePathname() || ''
  const active = (href: string) =>
    href === '/keyholder' ? path === '/keyholder' : path.startsWith(href)

  // Owner-only, exactly as the legacy group was (each item carried ownerOnly).
  const canSeeAccess = role === 'owner'
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  const accessOn = ACCESS_ITEMS.some(i => path.startsWith(i.href))

  return (
    <div style={{ borderBottom: `1px solid ${L.lineSoft}`, background: L.card, fontFamily: F.sans }}>
      <div style={{ ...container, display: 'flex', alignItems: 'center', gap: '36px', padding: '20px 40px' }}>
      <Link href="/keyholder" style={{ fontFamily: F.serif, fontSize: '23px', color: L.ink, textDecoration: 'none' }}>
        Keyholder
      </Link>
      <div style={{ display: 'flex', gap: '6px' }}>
        {SECTIONS.map(s => {
          const on = active(s.href)
          return (
            <Link key={s.id} href={s.href} style={{
              padding: '8px 16px', borderRadius: '99px', fontSize: '14px', textDecoration: 'none',
              background: on ? L.ink : 'transparent',
              color: on ? '#fff' : 'oklch(0.45 0.01 60)',
              fontWeight: on ? 600 : 400,
            }}>{s.name}</Link>
          )
        })}

        {canSeeAccess && (
          <div ref={wrap} style={{ position: 'relative' }}>
            <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="menu"
              style={{
                padding: '8px 14px', borderRadius: '99px', fontSize: '14px', cursor: 'pointer',
                border: 'none', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: '6px',
                background: accessOn ? L.ink : 'transparent',
                color: accessOn ? '#fff' : 'oklch(0.45 0.01 60)',
                fontWeight: accessOn ? 600 : 400,
              }}>
              Access
              <span style={{ fontSize: '9px', opacity: 0.7, transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
            </button>
            {open && (
              <div role="menu" style={{
                position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 50,
                minWidth: '248px', background: L.card,
                border: `1px solid ${L.line}`, borderRadius: '10px', padding: '6px',
                boxShadow: '0 6px 24px oklch(0.25 0.01 60 / 0.10)',
              }}>
                {ACCESS_ITEMS.map(i => {
                  const on = path.startsWith(i.href)
                  return (
                    <Link key={i.href} href={i.href} role="menuitem" onClick={() => setOpen(false)}
                      style={{
                        display: 'block', padding: '9px 11px', borderRadius: '7px',
                        textDecoration: 'none', background: on ? L.cardAlt : 'transparent',
                      }}>
                      <span style={{ display: 'block', fontSize: '14px', color: L.ink, fontWeight: on ? 600 : 500 }}>{i.name}</span>
                      <span style={{ display: 'block', fontSize: '12px', color: L.inkFaint, marginTop: '1px' }}>{i.note}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '14px' }}>
        <Link href="/admin" style={{
          fontSize: '12px', color: L.inkMuted, textDecoration: 'none',
          padding: '7px 13px', border: `1px solid ${L.line}`, borderRadius: '99px',
        }}>Legacy admin</Link>
        <span style={{
          width: '34px', height: '34px', borderRadius: '50%', background: 'oklch(0.88 0.03 78)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 600,
        }}>{initial}</span>
      </div>
      </div>
    </div>
  )
}
