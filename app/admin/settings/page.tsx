import { createAdminClient } from '@/lib/supabase/server'
import SettingsForm from '@/components/admin/SettingsForm'

export default async function SettingsPage() {
  const supabase = createAdminClient()
  const { data: settings } = await supabase
    .from('admin_settings')
    .select('*')
    .single()

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Configuration</div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>Settings.</h1>
      </div>
      <SettingsForm settings={settings} />
    </div>
  )
}
