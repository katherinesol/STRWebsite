import { NextRequest, NextResponse } from 'next/server'
import { hasRole, hasPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  // Reads expenses only - it is a POST because it takes a body, not because it writes.
  // The method is not the level; what it does is.
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  if (!await hasPermission('money', 'view')) return NextResponse.json({ error: 'Not allowed to view expenses' }, { status: 403 })
  const { vendor, amount, date } = await request.json()
  if (!amount || !date) return NextResponse.json({ dup: null })
  const supabase = createAdminClient()

  if (vendor) {
    const { data: exact } = await supabase.from('expenses').select('id').eq('vendor', vendor).eq('amount', amount).eq('date', date).limit(1)
    if (exact?.length) return NextResponse.json({ dup: 'exact', message: `Identical: ${vendor} $${amount} on ${date}` })
  }
  const { data: sameDay } = await supabase.from('expenses').select('vendor').eq('amount', amount).eq('date', date).limit(1)
  if (sameDay?.length) return NextResponse.json({ dup: 'sameday', message: `Same $${amount} already on ${date} (${sameDay[0].vendor || 'no vendor'})` })

  if (vendor) {
    const b = new Date(date); b.setDate(b.getDate() - 3)
    const a = new Date(date); a.setDate(a.getDate() + 3)
    const { data: nearby } = await supabase.from('expenses').select('date').eq('vendor', vendor).eq('amount', amount)
      .gte('date', b.toISOString().split('T')[0]).lte('date', a.toISOString().split('T')[0]).limit(1)
    if (nearby?.length) return NextResponse.json({ dup: 'nearby', message: `${vendor} $${amount} within 3 days (${nearby[0].date})` })
  }
  return NextResponse.json({ dup: null })
}
