import { createAdminClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import ReviewActions from '@/components/admin/ReviewActions'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East',
  'royal-york-west': 'Royal York West',
  'nickel-beach':    'Nickel Beach',
}

const PLATFORM_COLORS: Record<string, string> = {
  direct:  '#B8956B',
  airbnb:  '#FF5A5F',
  vrbo:    '#3D6ECC',
  houfy:   '#2ECC71',
}

export default async function ReviewsPage() {
  const supabase = createAdminClient()
  const { data: reviews } = await supabase
    .from('reviews')
    .select('*')
    .order('created_at', { ascending: false })

  const published = reviews?.filter(r => r.published).length || 0
  const pending = reviews?.filter(r => !r.published).length || 0

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Management</div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>Reviews.</h1>
      </div>

      {/* stats */}
      <div style={{ display: 'flex', gap: '1px', marginBottom: '24px' }}>
        {[
          { label: 'Total', value: reviews?.length || 0 },
          { label: 'Published', value: published },
          { label: 'Pending approval', value: pending, highlight: pending > 0 },
        ].map(({ label, value, highlight }) => (
          <div key={label} style={{ background: '#242422', border: '0.5px solid #363634', padding: '16px 24px', minWidth: '120px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '.14em', textTransform: 'uppercase', color: '#666660', marginBottom: '6px' }}>{label}</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: highlight ? 'var(--amber)' : '#F5F2EC' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* reviews list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        {!reviews?.length ? (
          <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '40px', textAlign: 'center', fontSize: '13px', color: '#666660' }}>
            No reviews yet
          </div>
        ) : reviews.map(r => (
          <div key={r.id} style={{ background: '#242422', border: '0.5px solid #363634', padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', padding: '2px 8px', background: '#1A1A18', color: PLATFORM_COLORS[r.platform] || '#888880' }}>
                    {r.platform}
                  </span>
                  <span style={{ fontSize: '12px', color: '#AEAEA6' }}>{PROPERTY_NAMES[r.property_id]}</span>
                  <span style={{ fontSize: '12px', color: '#666660' }}>{'★'.repeat(r.rating || 0)}</span>
                  <span style={{ fontSize: '11px', color: '#555550' }}>{format(new Date(r.created_at), 'MMM d, yyyy')}</span>
                </div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: '16px', fontStyle: 'italic', color: '#F5F2EC', lineHeight: 1.6, marginBottom: '6px' }}>
                  "{r.body}"
                </div>
                <div style={{ fontSize: '12px', color: '#9A9A92' }}>— {r.guest_name}</div>
                {r.host_reply && (
                  <div style={{ marginTop: '10px', padding: '10px 14px', background: '#1E1E1C', borderLeft: '2px solid var(--amber)', fontSize: '12px', color: '#AEAEA6', lineHeight: 1.6 }}>
                    <span style={{ fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--amber)', display: 'block', marginBottom: '4px' }}>Host reply</span>
                    {r.host_reply}
                  </div>
                )}
              </div>
              <ReviewActions review={r} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
