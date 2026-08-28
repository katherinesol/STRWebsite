import { redirect } from 'next/navigation'
import { getAuth } from '@/lib/auth'

/*  Owner-only, matching the nav exactly.
 *
 *  The legacy /admin versions of these screens carry NO server gate — they are
 *  'use client' pages whose protection is entirely in the APIs they call. That
 *  was survivable behind the dark side rail, which only rendered the group for
 *  an owner, but a light-shell route is guessable and the shell itself admits
 *  any authenticated user. So the gate moves here, where it is a redirect rather
 *  than four separate checks that can drift apart.
 *
 *  The owner short-circuits on the first clause and the superadmin on the
 *  second, so neither can be locked out of their own door log by a permissions
 *  map that happens to be empty — which is the shape an owner's actually is. */
export const dynamic = 'force-dynamic'

export default async function AccessLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth()
  if (!auth.ok) redirect('/login')
  if (auth.role !== 'owner' && auth.isSuperadmin !== true) redirect('/keyholder')
  return <>{children}</>
}
