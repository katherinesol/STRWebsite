import { NextRequest, NextResponse } from 'next/server'
import { isAuthed } from '@/lib/auth'


export async function POST(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true, note: 'Email provider not yet connected' })
}
