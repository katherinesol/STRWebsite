import { NextRequest, NextResponse } from 'next/server'
import { getTaskAccess, canAccessProperty } from '@/lib/task-access'
import { createAdminClient } from '@/lib/supabase/server'

// mark a task complete — attributed to the logged-in user automatically
export async function POST(request: NextRequest) {
  const access = await getTaskAccess()
  if (!access.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { task_id, note, booking_id } = await request.json()
  if (!task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 })

  const supabase = createAdminClient()
  // load the task to check property access
  const { data: task } = await supabase.from('maintenance_tasks').select('property_id').eq('id', task_id).maybeSingle()
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  // cleaners can only complete tasks on their assigned properties
  if (access.role !== 'owner' && !canAccessProperty(access, task.property_id)) {
    return NextResponse.json({ error: 'Not assigned to that property' }, { status: 403 })
  }

  const { error } = await supabase.from('task_completions').insert({
    task_id,
    completed_by: access.userId,
    note: note || null,
    booking_id: booking_id || null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// completion history for one task (the "last done by X" log)
export async function GET(request: NextRequest) {
  const access = await getTaskAccess()
  if (!access.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const taskId = request.nextUrl.searchParams.get('task_id')
  if (!taskId) return NextResponse.json({ error: 'task_id required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('task_completions')
    .select('completed_at, note, profiles:completed_by(name)')
    .eq('task_id', taskId)
    .order('completed_at', { ascending: false })
    .limit(20)
  return NextResponse.json({ history: (data || []).map(c => ({ at: c.completed_at, note: c.note, by: (c.profiles as any)?.name })) })
}
