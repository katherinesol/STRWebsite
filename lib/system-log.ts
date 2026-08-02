import { createAdminClient } from '@/lib/supabase/server'

// Record something the system did automatically, so it's visible on the activity log.
export async function logSystem(event_type: string, summary: string, detail?: any, property_id?: string) {
  try {
    const supabase = createAdminClient()
    await supabase.from('system_log').insert({ event_type, summary, detail: detail || null, property_id: property_id || null })
  } catch { /* logging must never break the action it's recording */ }
}
