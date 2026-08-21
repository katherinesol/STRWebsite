'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { L, F } from '@/lib/design-tokens'

// Sub-tabs beneath a section, e.g. Money · Income / Expenses / Invoices / Tax & filing.
export default function KeyholderTabs({ section, tabs }: {
  section: string
  tabs: { name: string; href: string }[]
}) {
  const path = usePathname() || ''
  return (
    <div style={{ display: 'flex', gap: '26px', fontSize: '13px', color: L.inkMuted, fontFamily: F.sans, flexWrap: 'wrap' }}>
      <span>{section}</span><span>·</span>
      {tabs.map(t => {
        const on = path === t.href || path.startsWith(t.href + '/')
        return (
          <Link key={t.href} href={t.href} style={{
            textDecoration: 'none',
            color: on ? L.ink : L.inkMuted,
            fontWeight: on ? 600 : 400,
            borderBottom: on ? `2px solid ${L.ink}` : '2px solid transparent',
            paddingBottom: '3px',
          }}>{t.name}</Link>
        )
      })}
    </div>
  )
}
