'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function Nav({ brandName = '[Your Brand]' }: { brandName?: string }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 10) }
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      height: '56px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '0 40px',
      background: 'var(--chalk)',
      borderBottom: scrolled ? '0.5px solid var(--sand)' : '0.5px solid transparent',
      transition: 'border-color .3s',
    }}>
      <Link href="/" style={{
        fontFamily: 'var(--serif)', fontSize: '22px',
        fontStyle: 'italic', fontWeight: 300, color: 'var(--noir)',
        letterSpacing: '.01em',
      }}>
        {brandName}<span style={{ color: 'var(--amber)' }}>.</span>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
        {[
          { href: '#properties', label: 'Properties' },
          { href: '#guide', label: 'Local Guide' },
          { href: '#about', label: 'About' },
          { href: '#faq', label: 'FAQ' },
        ].map(({ href, label }) => (
          <Link key={href} href={href} style={{
            fontSize: '11px', letterSpacing: '.1em',
            textTransform: 'uppercase', color: 'var(--muted)',
            transition: 'color .2s',
          }}>
            {label}
          </Link>
        ))}
        <Link href="#properties" style={{
          fontSize: '11px', letterSpacing: '.1em',
          textTransform: 'uppercase', color: 'var(--noir)',
          borderBottom: '1px solid var(--noir)', paddingBottom: '1px',
        }}>
          Book direct
        </Link>
      </div>
    </nav>
  )
}
