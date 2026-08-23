'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { L, F, container } from '@/lib/design-tokens'

// Top nav from the rebrand: five sections, not the thirty-item side rail.
// Assistant is the home for the AI/comms cluster — Haussy, Inbox, Knowledge, Concierge —
// which had nowhere to live under the original four.
export const SECTIONS = [
  { id: 'today', name: 'Today', href: '/keyholder' },
  { id: 'stays', name: 'Stays', href: '/keyholder/stays' },
  { id: 'money', name: 'Money', href: '/keyholder/money' },
  { id: 'property', name: 'Property', href: '/keyholder/property' },
  { id: 'assistant', name: 'Assistant', href: '/keyholder/assistant' },
]

export default function KeyholderNav({ initial }: { initial: string }) {
  const path = usePathname() || ''
  const active = (href: string) =>
    href === '/keyholder' ? path === '/keyholder' : path.startsWith(href)

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
