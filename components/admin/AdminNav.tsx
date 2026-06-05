'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: '▦' },
  { href: '/admin/bookings', label: 'Bookings', icon: '◈' },
  { href: '/admin/calendar', label: 'Calendar', icon: '▦' },
  { href: '/admin/guests', label: 'Guests', icon: '◉' },
  { href: '/admin/properties', label: 'Properties', icon: '⌂' },
  { href: '/admin/access', label: 'Access', icon: '⊙' },
  { href: '/admin/reviews', label: 'Reviews', icon: '◎' },
  { href: '/admin/damage', label: 'Damage', icon: '⚠' },
  { href: '/admin/newsletter', label: 'Newsletter', icon: '◻' },
  { href: '/admin/settings', label: 'Settings', icon: '◈' },
]

export default function AdminNav() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  return (
    <div style={{
      position: 'fixed', left: 0, top: 0, bottom: 0,
      width: '220px', background: '#242422',
      borderRight: '0.5px solid #363634',
      display: 'flex', flexDirection: 'column',
      zIndex: 50,
    }}>
      {/* logo */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '0.5px solid #363634' }}>
        <div style={{
          fontFamily: 'var(--serif)', fontSize: '20px', fontStyle: 'italic',
          fontWeight: 300, color: '#F5F2EC',
        }}>
          Admin<span style={{ color: 'var(--amber)' }}>.</span>
        </div>
        <div style={{ fontSize: '9px', letterSpacing: '.14em', textTransform: 'uppercase', color: '#888880', marginTop: '2px' }}>
          Host dashboard
        </div>
      </div>

      {/* nav links */}
      <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href || (href !== '/admin' && pathname.startsWith(href))
          return (
            <Link key={href} href={href} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 20px',
              background: active ? '#363634' : 'transparent',
              color: active ? '#F5F2EC' : '#AEAEA6',
              fontSize: '13px', textDecoration: 'none',
              borderLeft: active ? '2px solid var(--amber)' : '2px solid transparent',
              transition: 'all .15s',
            }}>
              <span style={{ fontSize: '12px', opacity: .7 }}>{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* logout */}
      <div style={{ padding: '16px 20px', borderTop: '0.5px solid #363634' }}>
        <button
          onClick={handleLogout}
          style={{
            width: '100%', padding: '10px',
            background: 'transparent', border: '0.5px solid #363634',
            color: '#AEAEA6', fontFamily: 'var(--sans)',
            fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase',
            cursor: 'pointer', borderRadius: '2px',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
