'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function PortalHome() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState<any[]>([])
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/portal/login'); return }
      setUser(session.user)

      // fetch bookings for this email
      const res = await fetch(`/api/portal/bookings?email=${encodeURIComponent(session.user.email!)}`)
      const data = await res.json()
      setBookings(data.bookings || [])
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--linen)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sans)', color: 'var(--muted)' }}>
      Loading your portal...
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--linen)', fontFamily: 'var(--sans)', padding: 'clamp(32px, 6vw, 64px) clamp(20px, 5vw, 40px)' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        <div style={{ marginBottom: '40px' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(32px, 6vw, 48px)', fontWeight: 300, color: 'var(--noir)', marginBottom: '8px' }}>
            Your stays<span style={{ color: 'var(--amber)' }}>.</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{user?.email}</div>
        </div>

        {!bookings.length ? (
          <div style={{ background: 'white', border: '0.5px solid var(--sand)', padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: 'var(--muted)' }}>No bookings found for this email address.</div>
            <a href="mailto:hello@yourdomain.com" style={{ fontSize: '13px', color: 'var(--amber)', marginTop: '12px', display: 'block' }}>
              Questions? Contact us directly.
            </a>
          </div>
        ) : bookings.map((b: any) => (
          <a key={b.id} href={`/portal/${b.id}`} style={{
            display: 'block', background: 'white', border: '0.5px solid var(--sand)',
            padding: '24px', marginBottom: '1px', textDecoration: 'none',
            transition: 'background .15s',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '6px' }}>
              {b.property_id === 'royal-york-east' ? 'Royal York East Suite' : b.property_id === 'royal-york-west' ? 'Royal York West Suite' : 'Nickel Beach Retreat'}
            </div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '22px', fontWeight: 300, color: 'var(--noir)', marginBottom: '6px' }}>
              {new Date(b.check_in).toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })} → {new Date(b.check_out).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              {b.nights} nights · {typeof b.guests === 'number' ? b.guests : ''} guests · Ref: {b.booking_reference}
            </div>
          </a>
        ))}

        <button
          onClick={() => { supabase.auth.signOut(); router.push('/portal/login') }}
          style={{ marginTop: '32px', background: 'none', border: 'none', fontSize: '12px', color: 'var(--muted)', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
