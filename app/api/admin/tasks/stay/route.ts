import { NextRequest, NextResponse } from 'next/server'
import { getTaskAccess, canAccessProperty } from '@/lib/task-access'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed } from '@/lib/auth'

// per-stay tasks for a property + completion status for a specific booking
export async function GET(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await getTaskAccess()
  if (!access.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const propertyId = request.nextUrl.searchParams.get('property')
  const bookingId = request.nextUrl.searchParams.get('booking')
  if (!propertyId || !bookingId) return NextResponse.json({ error: 'property and booking required' }, { status: 400 })

  if (access.role !== 'owner' && !canAccessProperty(access, propertyId)) {
    return NextResponse.json({ error: 'Not assigned' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const { data: tasks } = await supabase
    .from('maintenance_tasks')
    .select('*')
    .eq('cadence', 'per-stay')
    .eq('active', true)
    .or(`property_id.eq.${propertyId},property_id.is.null`)

  const taskIds = (tasks || []).map(t => t.id)
  const done: Record<string, any> = {}
  if (taskIds.length) {
    const { data: comps } = await supabase
      .from('task_completions')
      .select('task_id, completed_at, profiles:completed_by(name)')
      .eq('booking_id', bookingId)
      .in('task_id', taskIds)
    for (const c of comps || []) done[c.task_id] = { at: c.completed_at, by: (c.profiles as any)?.name }
  }

  const checklist = (tasks || []).map(t => ({
    ...t,
    done: !!done[t.id],
    doneAt: done[t.id]?.at || null,
    doneBy: done[t.id]?.by || null,
  }))

  return NextResponse.json({ checklist })
}
