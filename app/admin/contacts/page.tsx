import { createAdminClient } from '@/lib/supabase/server'
import ContactsManager from '@/components/admin/ContactsManager'

export const dynamic = 'force-dynamic'

export default async function ContactsPage() {
  const supabase = createAdminClient()
  const { data: contacts } = await supabase.from('contacts').select('*').order('name')
  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Management</div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300, color: '#F5F2EC' }}>Contacts.</h1>
        <p style={{ fontSize: '12px', color: '#9A9A92', marginTop: '6px' }}>Receipts emailed from these addresses are auto-tagged to the contact.</p>
      </div>
      <ContactsManager initialContacts={contacts || []} />
    </div>
  )
}
