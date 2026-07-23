import { NextRequest, NextResponse } from 'next/server'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  if (!await hasRole('owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()
  const { task } = await request.json()
  if (!task?.title) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase.from('maintenance_tasks').insert({
    title: task.title,
    description: task.description || null,
    property_id: task.property_id || null,
    type: task.type || 'admin',
    cadence: task.cadence || null,
    due_date: task.due_date || null,
    priority: task.priority || 'normal',
    notes: task.notes || null,
    active: true,
    created_by: auth.ok ? auth.userId : null,
  }).select('id, title, due_date').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await supabase.from('haussy_log').insert({
      user_id: auth.ok ? auth.userId : null,
      user_role: auth.ok ? auth.role : 'owner',
      question: '[create_task]',
      tools_called: [{ tool: 'create_task', input: { title: task.title, due_date: task.due_date }, ok: true }],
      answer_preview: `Created task: ${task.title}`,
    })
  } catch {}

  return NextResponse.json({ ok: true, task: data })
}
