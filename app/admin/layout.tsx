import { redirect } from 'next/navigation'
import AdminNav from '@/components/admin/AdminNav'
import { getAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth()
  if (!auth.ok) {
    redirect('/login')
  }
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#111110', fontFamily: 'var(--sans)' }}>
      <AdminNav role={auth.role} />
      <main className="admin-main">
        {children}
      </main>
    </div>
  )
}
