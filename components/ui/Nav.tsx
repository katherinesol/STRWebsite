'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function Nav({ brandName = '[Your Brand]' }: { brandName?: string }) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 10) }
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // close menu on resize to desktop
  useEffect(() => {
    function onResize() { if (window.innerWidth > 768) setMenuOpen(false) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const links = [
    { href: '#properties', label: 'Properties' },
    { href: '#guide', label: 'Local Guide' },
    { href: '#about', label: 'About' },
    { href: '#faq', label: 'FAQ' },
  ]

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: '56px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 clamp(20px, 5vw, 40px)',
        background: 'var(--chalk)',
        borderBottom: scrolled ? '0.5px solid var(--sand)' : '0.5px solid transparent',
        transition: 'border-color .3s',
      }}>
        {/* logo */}
        <Link href="/" style={{
          fontFamily: 'var(--serif)', fontSize: '22px',
          fontStyle: 'italic', fontWeight: 300, color: 'var(--noir)',
          letterSpacing: '.01em', textDecoration: 'none',
        }}>
          {brandName}<span style={{ color: 'var(--amber)' }}>.</span>
        </Link>

        {/* desktop links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}
          className="nav-desktop">
          {links.map(({ href, label }) => (
            <Link key={href} href={href} style={{
              fontSize: '11px', letterSpacing: '.1em',
              textTransform: 'uppercase', color: 'var(--muted)',
              textDecoration: 'none',
            }}>
              {label}
            </Link>
          ))}
          <Link href="#properties" style={{
            fontSize: '11px', letterSpacing: '.1em',
            textTransform: 'uppercase', color: 'var(--noir)',
            borderBottom: '1px solid var(--noir)', paddingBottom: '1px',
            textDecoration: 'none',
          }}>
            Book direct
          </Link>
        </div>

        {/* mobile hamburger */}
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="nav-mobile"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '8px', display: 'flex', flexDirection: 'column',
            gap: '5px', alignItems: 'flex-end',
          }}
        >
          <span style={{ display: 'block', width: menuOpen ? '20px' : '20px', height: '1.5px', background: 'var(--noir)', transition: 'all .2s', transform: menuOpen ? 'rotate(45deg) translate(4px, 4px)' : 'none' }} />
          <span style={{ display: 'block', width: '14px', height: '1.5px', background: 'var(--noir)', transition: 'all .2s', opacity: menuOpen ? 0 : 1 }} />
          <span style={{ display: 'block', width: menuOpen ? '20px' : '20px', height: '1.5px', background: 'var(--noir)', transition: 'all .2s', transform: menuOpen ? 'rotate(-45deg) translate(4px, -4px)' : 'none' }} />
        </button>
      </nav>

      {/* mobile menu */}
      {menuOpen && (
        <div style={{
          position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0,
          background: 'var(--chalk)', zIndex: 99,
          display: 'flex', flexDirection: 'column',
          padding: '32px clamp(20px, 5vw, 40px)',
          borderTop: '0.5px solid var(--sand)',
        }}>
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              style={{
                fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300,
                color: 'var(--noir)', textDecoration: 'none', lineHeight: 1,
                padding: '16px 0', borderBottom: '0.5px solid var(--sand)',
              }}
            >
              {label}
            </Link>
          ))}
          <Link
            href="#properties"
            onClick={() => setMenuOpen(false)}
            style={{
              fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300,
              fontStyle: 'italic', color: 'var(--amber)', textDecoration: 'none',
              lineHeight: 1, padding: '16px 0', marginTop: '8px',
            }}
          >
            Book direct →
          </Link>
        </div>
      )}

      <style>{`
        @media (min-width: 769px) { .nav-mobile { display: none !important; } }
        @media (max-width: 768px) { .nav-desktop { display: none !important; } }
      `}</style>
    </>
  )
}
