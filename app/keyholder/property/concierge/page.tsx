import { redirect } from 'next/navigation'
import { hasRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import ConciergeWorkbench from '@/components/keyholder/ConciergeWorkbench'

export const dynamic = 'force-dynamic'

const PROPERTIES = [
  { id: 'nickel-beach', name: 'Nickel Beach' },
  { id: 'royal-york-west', name: 'Royal York West' },
  { id: 'royal-york-east', name: 'Royal York East' },
]

export default async function ConciergePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  if (!await hasRole('owner', 'co-owner')) redirect('/keyholder')
  const sp = await searchParams
  const active = PROPERTIES.some(p => p.id === sp.p) ? sp.p! : 'nickel-beach'

  const supabase = createAdminClient()
  const [{ data: entries }, { data: asked }] = await Promise.all([
    supabase.from('knowledge_base').select('*').order('topic').order('title'),
    /* What guests actually asked. needs_followup is the bot admitting it had
       nothing — the doc's "questions it couldn't answer". */
    supabase.from('guest_questions').select('*').order('created_at', { ascending: false }).limit(50),
  ])

  const all = entries || []
  const counts = Object.fromEntries(PROPERTIES.map(p => [p.id, all.filter(e => e.property_id === p.id && e.active).length]))

  return (
    <ConciergeWorkbench
      properties={PROPERTIES}
      active={active}
      counts={counts}
      entries={all.filter(e => e.property_id === active || e.property_id === 'general')}
      globalCount={all.filter(e => e.property_id === 'general').length}
      questions={(asked || []).filter(q => q.property_id === active)}
    />
  )
}
