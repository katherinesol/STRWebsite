import { L, F } from '@/lib/design-tokens'

export default function KeyholderToday() {
  return (
    <div style={{ padding: '44px' }}>
      <span style={{ fontFamily: F.serif, fontSize: '40px', lineHeight: 1 }}>Today</span>
      <p style={{ fontSize: '15px', color: L.inkBody, marginTop: '10px', maxWidth: '560px', lineHeight: 1.55 }}>
        Not built yet. The first screen moved across is <a href="/keyholder/money/tax" style={{ color: L.link, fontWeight: 600 }}>Money → Tax &amp; filing</a>.
      </p>
    </div>
  )
}
