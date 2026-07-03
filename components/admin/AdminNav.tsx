'use client'
import Link from 'next/link'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: '▦' },
  { href: '/admin/bookings', label: 'Bookings', icon: '◈' },
  { href: '/admin/calendar', label: 'Calendar', icon: '▦' },
  { href: '/admin/tasks', label: 'Tasks', icon: '☑' },
  { href: '/admin/guests', label: 'Guests', icon: '◉' },
  { href: '/admin/contacts', label: 'Contacts', icon: '✉' },
  { href: '/admin/properties', label: 'Properties', icon: '⌂' },
  { href: '/admin/access', label: 'Access', icon: '⊙' },
  { href: '/admin/reviews', label: 'Reviews', icon: '◎' },
  { href: '/admin/damage', label: 'Damage', icon: '⚠' },
  { href: '/admin/newsletter', label: 'Newsletter', icon: '◻' },
  { href: '/admin/property-management', label: 'Prop mgmt', icon: '⚙' },
  { href: '/admin/settings', label: 'Settings', icon: '◈' },
  { href: '/admin/users', label: 'Team & Access', icon: '⊕', ownerOnly: true },
]

function NavLinks({ pathname, onNavigate, onLogout }: { pathname: string; onNavigate?: () => void; onLogout: () => void }) {
  return (
    <>
      <div style={{ padding: '24px 20px 16px', fontSize: '11px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)' }}>
        Admin
      </div>
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {NAV.map(item => {
          const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 20px', minHeight: '44px',
                fontSize: '13px', textDecoration: 'none',
                color: active ? '#F5F2EC' : '#9A9A92',
                background: active ? '#242422' : 'transparent',
                borderLeft: active ? '2px solid var(--amber)' : '2px solid transparent',
              }}>
              <span style={{ fontSize: '12px', opacity: .7 }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>
      <button onClick={onLogout}
        style={{ margin: '16px 20px', padding: '10px', background: 'none', border: '0.5px solid #363634', color: '#9A9A92', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
        Log out
      </button>
    </>
  )
}

export default function AdminNav({ role = 'cleaner' }: { role?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <>
      {/* desktop sidebar */}
      <div className="admin-sidebar" style={{
        position: 'fixed', left: 0, top: 0, bottom: 0,
        width: '220px', background: '#1A1A18',
        borderRight: '0.5px solid #363634',
        flexDirection: 'column',
      }}>
        <NavLinks pathname={pathname} onLogout={handleLogout} />
      </div>

      {/* mobile top bar */}
      <div className="admin-mobilebar">
        <div style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)' }}>
          Admin
        </div>
        <button onClick={() => setOpen(o => !o)} aria-label="Menu"
          style={{ background: 'none', border: 'none', color: '#F5F2EC', fontSize: '20px', cursor: 'pointer', padding: '8px', minWidth: '44px', minHeight: '44px' }}>
          {open ? '✕' : '☰'}
        </button>
      </div>

      {/* mobile drawer */}
      {open && <div className="admin-drawer-overlay" onClick={() => setOpen(false)} />}
      <div className={`admin-drawer${open ? ' open' : ''}`} style={{ display: 'flex', flexDirection: 'column' }}>
        <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} onLogout={handleLogout} />
      </div>
    </>
  )
}
