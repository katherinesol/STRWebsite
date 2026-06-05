import { createAdminClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import NewsletterCompose from '@/components/admin/NewsletterCompose'

export default async function NewsletterPage() {
  const supabase = createAdminClient()
  const { data: subscribers } = await supabase
    .from('newsletter_subscribers')
    .select('*')
    .is('unsubscribed_at', null)
    .order('subscribed_at', { ascending: false })

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Management</div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>Newsletter.</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '16px', alignItems: 'start' }}>
        {/* subscriber list */}
        <div>
          <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)' }}>
                Subscribers
              </div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: '24px', fontWeight: 300, color: '#F5F2EC' }}>
                {subscribers?.length || 0}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', maxHeight: '400px', overflowY: 'auto' }}>
              {!subscribers?.length ? (
                <div style={{ fontSize: '13px', color: '#666660', padding: '12px 0' }}>No subscribers yet</div>
              ) : subscribers.map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '0.5px solid #363634', fontSize: '13px' }}>
                  <span style={{ color: '#F5F2EC' }}>{s.email}</span>
                  <span style={{ color: '#666660', fontSize: '11px' }}>{format(new Date(s.subscribed_at), 'MMM d, yyyy')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* compose */}
        <div style={{ position: 'sticky', top: '32px' }}>
          <NewsletterCompose count={subscribers?.length || 0} />
        </div>
      </div>
    </div>
  )
}
