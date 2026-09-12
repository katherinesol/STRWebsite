import Link from 'next/link'
import { L, F, cardStyle, microLabel } from '@/lib/design-tokens'
import { loadAllProperties } from '@/lib/properties-db'

export const dynamic = 'force-dynamic'

/*  Three properties, three tabs each — and one honest bridge.
 *
 *  This page no longer sends anyone to the legacy dashboard. /admin/properties,
 *  /admin/properties/[id] and its pricing page now redirect here instead; the
 *  traffic runs the other way.
 *
 *  The Photos bridge is gone — the tab it was waiting for exists, so the last
 *  link out of the new shell went with it. Four tabs, no exceptions, and the
 *  legacy property pages all redirect here. */
export default async function PropertyIndex() {
  const properties = await loadAllProperties()

  return (
    <div style={{ paddingTop: '24px', display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '720px' }}>
      <span style={{ fontFamily: F.serif, fontSize: '36px', lineHeight: 1 }}>Property</span>

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        {properties.map((p, i) => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 22px',
            borderTop: i ? `1px solid ${L.lineFaint}` : 'none', flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <Link href={`/keyholder/property/${p.id}`} style={{ fontSize: '15px', fontWeight: 600, color: L.ink, textDecoration: 'none' }}>
                {p.name}
              </Link>
              <span style={{ fontSize: '13px', color: L.inkMuted }}>
                {p.neighbourhood}, {p.city} · {(p.pois || []).length} places
              </span>
            </div>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
              {[['Content', ''], ['Places', '/places'], ['Photos', '/photos'], ['Pricing', '/pricing']].map(([label, sub]) => (
                <Link key={label} href={`/keyholder/property/${p.id}${sub}`}
                  style={{ fontSize: '13.5px', fontWeight: 600, color: L.link, textDecoration: 'none' }}>
                  {label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: '13.5px', color: L.inkMuted, lineHeight: 1.6 }}>
        Content, places, photos and pricing are all here. Nothing about a property is edited on the
        old admin any more.
      </p>
    </div>
  )
}
