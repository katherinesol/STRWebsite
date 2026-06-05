import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import AdminNav from '@/components/admin/AdminNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')?.value
  if (!session || session !== process.env.ADMIN_SECRET) {
    redirect('/admin/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#111110', fontFamily: 'var(--sans)' }}>
      <AdminNav />
      <main style={{ flex: 1, marginLeft: '220px', padding: '32px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  )
}
