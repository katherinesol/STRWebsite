import Link from 'next/link'
import { L, F, cardStyle, microLabel } from '@/lib/design-tokens'
import { loadAllProperties } from '@/lib/properties-db'

export const dynamic = 'force-dynamic'

/*  Three properties, three tabs each.
 *
 *  Content and Places land here now; Photos is still on the legacy admin, so the
 *  link below stays and still says so. Severing it is a separate commit, after
 *  this is verified — a back-link removed before its destination is proven is how
 *  /keyholder/stays came to claim a migration that had not happened. */
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
            <div style={{ display: 'flex', gap: '14px' }}>
              {[['Content', ''], ['Places', '/places'], ['Pricing', '/pricing']].map(([label, sub]) => (
                <Link key={label} href={`/keyholder/property/${p.id}${sub}`}
                  style={{ fontSize: '13.5px', fontWeight: 600, color: L.link, textDecoration: 'none' }}>
                  {label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: '14px', color: L.inkBody, lineHeight: 1.6 }}>
        Photos are still on the{' '}
        <a href="/admin" style={{ color: L.link, fontWeight: 600 }}>legacy admin</a>. Everything else is here.
      </p>
    </div>
  )
}
