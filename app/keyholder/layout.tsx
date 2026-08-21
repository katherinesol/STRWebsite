import { redirect } from 'next/navigation'
import { getAuth } from '@/lib/auth'
import KeyholderNav from '@/components/admin/KeyholderNav'
import { L, F } from '@/lib/design-tokens'

// The rebrand shell. Deliberately a sibling of /admin rather than a child:
// app/admin/layout.tsx wraps every descendant in the dark side-rail chrome,
// so a top-nav light shell cannot nest inside it. The legacy tree is untouched
// and reachable from the nav until every screen has moved across.
export const dynamic = 'force-dynamic'

export default async function KeyholderLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth()
  if (!auth.ok) redirect('/login')

  return (
    <div style={{ minHeight: '100vh', background: L.page, color: L.ink, fontFamily: F.sans }}>
      <KeyholderNav initial={(auth.name || 'K').slice(0, 1).toUpperCase()} />
      <main>{children}</main>
    </div>
  )
}
