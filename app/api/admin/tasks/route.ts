import { NextRequest, NextResponse } from 'next/server'
import { getTaskAccess, canAccessProperty } from '@/lib/task-access'
import { createAdminClient } from '@/lib/supabase/server'
import { isAuthed } from '@/lib/auth'

// list tasks with their latest completion + computed due status
export async function GET(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await getTaskAccess()
  if (!access.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  let query = supabase.from('maintenance_tasks').select('*').eq('active', true)

  // cleaners: restrict to assigned properties only
  if (access.role !== 'owner') {
    if (!access.propertyIds || access.propertyIds.length === 0) {
      return NextResponse.json({ tasks: [], assignedProperties: [] })
    }
    query = query.in('property_id', access.propertyIds)
  }

  const { data: tasks, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // attach latest completion for each task
  const taskIds = (tasks || []).map(t => t.id)
  const completions: Record<string, any> = {}
  if (taskIds.length) {
    const { data: comps } = await supabase
      .from('task_completions')
      .select('task_id, completed_at, note, completed_by, profiles:completed_by(name)')
      .in('task_id', taskIds)
      .order('completed_at', { ascending: false })
    for (const c of comps || []) {
      if (!completions[c.task_id]) completions[c.task_id] = c // first = latest due to ordering
    }
  }

  const enriched = (tasks || []).map(t => {
    const last = completions[t.id]
    return {
      ...t,
      lastCompletedAt: last?.completed_at || null,
      lastCompletedBy: (last?.profiles as any)?.name || null,
      dueStatus: computeDue(t.cadence, last?.completed_at),
    }
  })

  return NextResponse.json({
    tasks: enriched,
    role: access.role,
    assignedProperties: access.propertyIds,
  })
}

// create a task. Cleaners may only create maintenance tasks on their assigned properties.
export async function POST(request: NextRequest) {
  if (!await isAuthed()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await getTaskAccess()
  if (!access.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { title, description, property_id, type, cadence, priority } = body
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  // cleaners: can only add maintenance tasks, and only to assigned properties
  if (access.role !== 'owner') {
    if (type !== 'maintenance') {
      return NextResponse.json({ error: 'Cleaners can only add maintenance tasks' }, { status: 403 })
    }
    if (!canAccessProperty(access, property_id)) {
      return NextResponse.json({ error: 'Not assigned to that property' }, { status: 403 })
    }
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.from('maintenance_tasks').insert({
    title, description: description || null,
    property_id: property_id || null,
    type: type || 'cleaning',
    cadence: cadence || 'as-needed',
    priority: priority || 'normal',
    created_by: access.userId,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, task: data })
}

// compute due/overdue from cadence + last completion date
function computeDue(cadence: string, lastDate: string | null): { state: string; days?: number } {
  if (cadence === 'as-needed' || cadence === 'one-time') return { state: 'none' }
  if (cadence === 'per-stay') return { state: 'per-stay' }
  if (!lastDate) return { state: 'never-done' }
  const days = Math.floor((Date.now() - new Date(lastDate).getTime()) / 86400000)
  const period = cadence === 'weekly' ? 7 : cadence === 'monthly' ? 30 : cadence === 'annually' ? 365 : 0
  if (!period) return { state: 'none' }
  if (days >= period) return { state: 'overdue', days: days - period }
  return { state: 'ok', days: period - days } // days until due
}
