import { NextResponse } from 'next/server'
import { getCisternLevel } from '@/lib/cistern'

export async function GET() {
  // Vercel cron — fetch and store the daily reading
  const reading = await getCisternLevel(true)
  return NextResponse.json({ ok: true, level: reading?.percent ?? null })
}
