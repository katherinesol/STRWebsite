import Link from 'next/link'
import { L, F, cardStyle, microLabel } from '@/lib/design-tokens'
import { loadAllProperties } from '@/lib/properties-db'

export const dynamic = 'force-dynamic'

/*  Still a signpost, but no longer only a signpost.
 *
 *  The pricing calculator is reachable from here because it is a DECISION TOOL —
 *  it writes nothing, and it exists so the target nets can be chosen against real
 *  numbers rather than guessed at. Waiting for the full property editor before
 *  linking to it would mean the decision waits on the build that depends on the
 *  decision.
 *
 *  Everything else about a property is still edited on the legacy admin, and this
 *  says so plainly rather than hiding it. The /admin link goes when the Content,
 *  Places and Photos tabs land. */
export default async function PropertyIndex() {
  const properties = await loadAllProperties()

  return (
    <div style={{ paddingTop: '24px', display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '720px' }}>
      <span style={{ fontFamily: F.serif, fontSize: '36px', lineHeight: 1 }}>Property</span>

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        <div style={{ padding: '11px 22px', background: L.cardAlt, borderBottom: `1px solid ${L.lineSoft}` }}>
          <span style={microLabel}>Pricing — work each platform&apos;s price back from what you keep</span>
        </div>
        {properties.map((p, i) => (
          <Link key={p.id} href={`/keyholder/property/${p.id}/pricing`} style={{
            display: 'flex', alignItems: 'center', gap: '16px', padding: '15px 22px',
            borderTop: i ? `1px solid ${L.lineFaint}` : 'none', textDecoration: 'none',
          }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: L.ink }}>{p.name}</span>
              <span style={{ fontSize: '13px', color: L.inkMuted }}>{p.neighbourhood}, {p.city}</span>
            </div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: L.link }}>Pricing →</span>
          </Link>
        ))}
      </div>

      <p style={{ fontSize: '14px', color: L.inkBody, lineHeight: 1.6 }}>
        Descriptions, photos, places and settings are still on the{' '}
        <a href="/admin" style={{ color: L.link, fontWeight: 600 }}>legacy admin</a>. Those move here next.
      </p>
    </div>
  )
}
