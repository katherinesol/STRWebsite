import Link from 'next/link'
import NewGuestForm from '@/components/admin/NewGuestForm'

export default function NewGuestPage() {
  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/admin/guests" style={{ fontSize: '11px', color: '#9A9A92', textDecoration: 'none' }}>← Guests</Link>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F5F2EC', marginTop: '8px' }}>New guest.</h1>
      </div>
      <NewGuestForm />
    </div>
  )
}
