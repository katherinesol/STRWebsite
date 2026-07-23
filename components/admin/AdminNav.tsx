'use client'
import Link from 'next/link'
import { useState } from 'react'
import NavClock from './NavClock'
import { usePathname, useRouter } from 'next/navigation'

const DASHBOARD = { href: '/admin', label: 'Dashboard', icon: '▦' }

const SECTIONS = [
  { title: 'Operations', items: [
    { href: '/admin/bookings', label: 'Bookings', icon: '◈' },
    { href: '/admin/calendar', label: 'Calendar', icon: '▦' },
    { href: '/admin/tasks', label: 'Tasks', icon: '☑' },
  ]},
  { title: 'Assistant', items: [
    { href: '/admin/haussy', label: 'Haussy', icon: '✦', ownerOnly: false, staffOnly: true },
    { href: '/admin/concierge', label: 'Concierge Training', icon: '✦', ownerOnly: false, staffOnly: true },
  ] },
  { title: 'Guests', items: [
    { href: '/admin/inbox', label: 'Inbox', icon: '✉' },
    { href: '/admin/guests', label: 'Guests', icon: '◉' },
    { href: '/admin/contacts', label: 'Contacts', icon: '✉' },
    { href: '/admin/reviews', label: 'Reviews', icon: '◎' },
  ]},
  { title: 'Money', items: [
    { href: '/admin/income', label: 'Income', icon: '↑', staffOnly: true },
    { href: '/admin/property-management/finance', label: 'Expenses', icon: '$' },
    { href: '/admin/invoices', label: 'Invoices', icon: '❋', staffOnly: true },
    { href: '/admin/damage', label: 'Damage', icon: '⚠' },
  ]},
  { title: 'Property', items: [
    { href: '/admin/properties', label: 'Properties', icon: '⌂' },
    { href: '/admin/knowledge', label: 'Concierge Knowledge', icon: '❓', staffOnly: true },
    { href: '/admin/property-management', label: 'Prop mgmt', icon: '⚙' },
    { href: '/admin/access', label: 'Access', icon: '⊙' },
  ]},
  { title: 'Admin', items: [
    { href: '/admin/newsletter', label: 'Newsletter', icon: '◻' },
    { href: '/admin/settings', label: 'Settings', icon: '◈' },
    { href: '/admin/users', label: 'Team & Access', icon: '⊕', ownerOnly: true },
    { href: '/admin/security', label: 'Security', icon: '⊘' },
  ]},
]

function canSee(item: any, role: string) {
  if (item.ownerOnly && role !== 'owner') return false
  if (item.staffOnly && role !== 'owner' && role !== 'co-owner') return false
  return true
}

function NavLink({ item, pathname, onNavigate }: any) {
  const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
  return (
    <Link href={item.href} onClick={onNavigate}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 20px', minHeight: '40px',
        fontSize: '13px', textDecoration: 'none',
        color: active ? '#F5F2EC' : '#9A9A92',
        background: active ? '#242422' : 'transparent',
        borderLeft: active ? '2px solid var(--amber)' : '2px solid transparent',
      }}>
      <span style={{ fontSize: '12px', opacity: .7 }}>{item.icon}</span>
      {item.label}
    </Link>
  )
}

function NavLinks({ pathname, onNavigate, onLogout, role }: { pathname: string; onNavigate?: () => void; onLogout: () => void; role: string }) {
  // which section contains the current page — start expanded
  const initialOpen: Record<string, boolean> = {}
  for (const s of SECTIONS) {
    initialOpen[s.title] = s.items.some(it => pathname.startsWith(it.href))
  }
  const [open, setOpen] = useState<Record<string, boolean>>(initialOpen)

  return (
    <>
      <div style={{ padding: '24px 20px 12px', fontSize: '11px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)' }}>
        Admin
      </div>
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <NavLink item={DASHBOARD} pathname={pathname} onNavigate={onNavigate} />
        {SECTIONS.map(section => {
          const items = section.items.filter(it => canSee(it, role))
          if (!items.length) return null
          const isOpen = open[section.title]
          return (
            <div key={section.title}>
              <button onClick={() => setOpen(o => ({ ...o, [section.title]: !o[section.title] }))}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 20px 6px', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '10px', fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase',
                  color: '#666660', fontFamily: 'var(--sans)',
                }}>
                {section.title}
                <span style={{ fontSize: '9px', opacity: .6 }}>{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && items.map(item => (
                <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
              ))}
            </div>
          )
        })}
      </nav>
      <NavClock />
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
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <NavLinks pathname={pathname} onLogout={handleLogout}  role={role} />
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
        <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} onLogout={handleLogout} role={role} />
      </div>
    </>
  )
}
