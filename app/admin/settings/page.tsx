import { createAdminClient } from '@/lib/supabase/server'
import SettingsForm from '@/components/admin/SettingsForm'

export default async function SettingsPage() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://rental-direct-five.vercel.app'
  const icalToken = process.env.ICAL_SECRET || ''
  const icalUrls: Record<string, string> = {
    'royal-york-east': `${siteUrl}/api/ical/royal-york-east?token=${icalToken}`,
    'royal-york-west': `${siteUrl}/api/ical/royal-york-west?token=${icalToken}`,
    'nickel-beach': `${siteUrl}/api/ical/nickel-beach?token=${icalToken}`,
  }

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
