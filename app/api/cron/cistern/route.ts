import { NextRequest, NextResponse } from 'next/server'
import { getCisternLevel } from '@/lib/cistern'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Vercel cron — fetch and store the daily reading
  const reading = await getCisternLevel(true)
  return NextResponse.json({ ok: true, level: reading?.percent ?? null })
}
