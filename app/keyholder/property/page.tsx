import { L, F } from '@/lib/design-tokens'

export default function Placeholder() {
  return (
    <div style={{ paddingTop: '40px' }}>
      <span style={{ fontFamily: F.serif, fontSize: '40px', lineHeight: 1, textTransform: 'capitalize' }}>property</span>
      <p style={{ fontSize: '15px', color: L.inkBody, marginTop: '10px', maxWidth: '560px', lineHeight: 1.55 }}>
        Still on the legacy admin. <a href="/admin" style={{ color: L.link, fontWeight: 600 }}>Open it there →</a>
      </p>
    </div>
  )
}
