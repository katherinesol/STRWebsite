import Link from 'next/link'
import { L, F } from '@/lib/design-tokens'

/*  One header for the three tabs, so a property is one thing with three views
 *  rather than three pages that happen to share an id. */
export default function PropertyTabs({ id, name, active }: { id: string; name: string; active: 'content' | 'places' | 'pricing' }) {
  const tabs = [
    { key: 'content', label: 'Content', href: `/keyholder/property/${id}` },
    { key: 'places', label: 'Places', href: `/keyholder/property/${id}/places` },
    { key: 'pricing', label: 'Pricing', href: `/keyholder/property/${id}/pricing` },
  ] as const

  return (
    <div style={{ marginBottom: '24px' }}>
      <Link href="/keyholder/property" style={{ fontSize: '13px', color: L.link, textDecoration: 'none', fontWeight: 600 }}>
        ← All properties
      </Link>
      <div style={{ fontFamily: F.mono, fontSize: '11px', letterSpacing: '.16em', textTransform: 'uppercase', color: L.inkMuted, margin: '14px 0 4px' }}>
        {name}
      </div>
      <div style={{ display: 'flex', gap: '22px', borderBottom: `1px solid ${L.line}`, marginTop: '14px' }}>
        {tabs.map(t => (
          <Link key={t.key} href={t.href} style={{
            padding: '0 0 10px', fontSize: '14px', textDecoration: 'none',
            fontWeight: active === t.key ? 600 : 500,
            color: active === t.key ? L.ink : L.inkMuted,
            borderBottom: active === t.key ? `2px solid ${L.ink}` : '2px solid transparent',
            marginBottom: '-1px',
          }}>{t.label}</Link>
        ))}
      </div>
    </div>
  )
}
