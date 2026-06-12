import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === process.env.ADMIN_SECRET
}

export async function POST(request: NextRequest) {
  if (!await checkAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const supabase = createAdminClient()

  // duplicate detection — skip if force flag set
  if (!body.force) {
    const amount = body.amount
    const date = body.date
    const vendor = body.vendor

    // exact: same vendor + amount + date
    if (vendor) {
      const { data: exact } = await supabase.from('expenses')
        .select('id, vendor, amount, date')
        .eq('vendor', vendor).eq('amount', amount).eq('date', date)
        .limit(1)
      if (exact?.length) {
        return NextResponse.json({
          duplicate: true,
          level: 'exact',
          message: `Identical expense exists: ${vendor} $${amount} on ${date}`,
        }, { status: 409 })
      }
    }

    // same amount + date, any vendor
    const { data: sameDay } = await supabase.from('expenses')
      .select('id, vendor, amount, date')
      .eq('amount', amount).eq('date', date)
      .limit(1)
    if (sameDay?.length) {
      return NextResponse.json({
        duplicate: true,
        level: 'likely',
        message: `Same amount ($${amount}) already logged on ${date} (${sameDay[0].vendor || 'no vendor'})`,
      }, { status: 409 })
    }

    // same vendor + amount within 3 days
    if (vendor) {
      const d = new Date(date)
      const before = new Date(d); before.setDate(d.getDate() - 3)
      const after = new Date(d); after.setDate(d.getDate() + 3)
      const { data: nearby } = await supabase.from('expenses')
        .select('id, vendor, amount, date')
        .eq('vendor', vendor).eq('amount', amount)
        .gte('date', before.toISOString().split('T')[0])
        .lte('date', after.toISOString().split('T')[0])
        .limit(1)
      if (nearby?.length) {
        return NextResponse.json({
          duplicate: true,
          level: 'possible',
          message: `${vendor} $${amount} logged ${nearby[0].date} — within 3 days of this entry`,
        }, { status: 409 })
      }
    }
  }

  delete body.force
  const { data, error } = await supabase.from('expenses').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ expense: data })
}
