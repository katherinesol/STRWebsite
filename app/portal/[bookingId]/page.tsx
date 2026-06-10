'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { format, differenceInDays, subDays } from 'date-fns'

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East Suite',
  'royal-york-west': 'Royal York West Suite',
  'nickel-beach':    'Nickel Beach Retreat',
}

const SECTION_LABELS: Record<string, string> = {
  'getting-in': 'Getting in',
  'kitchen':    'Kitchen',
  'bathroom':   'Bathroom',
  'living':     'Living room',
  'laundry':    'Laundry',
  'outdoor':    'Outdoor',
}

const SECTION_ICONS: Record<string, string> = {
  'getting-in': '🔑',
  'kitchen':    '🍳',
  'bathroom':   '🚿',
  'living':     '📺',
  'laundry':    '👕',
  'outdoor':    '🌿',
}

export default function GuestPortal() {
  const router = useRouter()
  const params = useParams()
  const bookingId = params.bookingId as string

  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState<any>(null)
  const [guides, setGuides] = useState<any[]>([])
  const [pois, setPois] = useState<any[]>([])
  const [accessCode, setAccessCode] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeSection, setActiveSection] = useState('stay')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/portal/login'); return }

      const res = await fetch(`/api/portal/booking/${bookingId}?email=${encodeURIComponent(session.user.email!)}`)
      if (!res.ok) { router.push('/portal'); return }
      const data = await res.json()

      setBooking(data.booking)
      setGuides(data.guides || [])
      setPois(data.pois || [])

      // show access code if within 48hrs of check-in or already active
      const checkIn = new Date(data.booking.check_in)
      const now = new Date()
      const hoursUntil = (checkIn.getTime() - now.getTime()) / 3600000
      if (hoursUntil <= 48) setAccessCode(data.accessCode)

      setLoading(false)
    }
    load()
  }, [bookingId, router])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--linen)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sans)', color: 'var(--muted)' }}>
      Loading your stay...
    </div>
  )

  if (!booking) return null

  const checkIn = new Date(booking.check_in)
  const checkOut = new Date(booking.check_out)
  const today = new Date()
  const daysUntil = differenceInDays(checkIn, today)
  const isActive = today >= checkIn && today < checkOut
  const isPast = today >= checkOut

  // group guides by section
  const guidesBySection: Record<string, any[]> = {}
  for (const g of guides) {
    if (!guidesBySection[g.section]) guidesBySection[g.section] = []
    guidesBySection[g.section].push(g)
  }

  // search filter
  const searchResults = search.length >= 2
    ? guides.filter(g =>
        g.title.toLowerCase().includes(search.toLowerCase()) ||
        g.content.toLowerCase().includes(search.toLowerCase())
      )
    : []

  // payment items
  const payments = [
    { label: 'Deposit (10%)', amount: booking.deposit_amount, paid: booking.deposit_paid_at, due: 'Paid at booking' },
    { label: '50% balance', amount: booking.second_payment_amount, paid: booking.second_paid_at, due: booking.second_due_date ? format(new Date(booking.second_due_date), 'MMMM d, yyyy') : '60 days before check-in' },
    { label: 'Final payment', amount: booking.final_payment_amount, paid: booking.final_paid_at, due: booking.final_due_date ? format(new Date(booking.final_due_date), 'MMMM d, yyyy') : '30 days before check-in' },
  ]

  const NAV = [
    { id: 'stay', label: 'Your stay' },
    { id: 'home', label: 'The home' },
    { id: 'local', label: 'Local guide' },
    { id: 'payment', label: 'Payment' },
    { id: 'faq', label: 'FAQ' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--chalk)', fontFamily: 'var(--sans)' }}>
      {/* header */}
      <div style={{ background: 'var(--noir)', padding: 'clamp(24px,4vw,40px) clamp(20px,5vw,40px) 0' }}>
        <a href="/portal" style={{ fontSize: '11px', color: '#555550', textDecoration: 'none', letterSpacing: '.06em' }}>← Your stays</a>
        <div style={{ margin: '16px 0 0' }}>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '6px' }}>
            {PROPERTY_NAMES[booking.property_id]}
          </div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 300, color: '#F0EDE6', lineHeight: 1.05, marginBottom: '6px' }}>
            {isActive ? 'Welcome.' : isPast ? 'Past stay.' : daysUntil === 0 ? 'Today is the day.' : `${daysUntil} days to go.`}
          </div>
          <div style={{ fontSize: '13px', color: '#555550', marginBottom: '24px' }}>
            {format(checkIn, 'MMMM d')} → {format(checkOut, 'MMMM d, yyyy')} · {booking.nights} nights · Ref: {booking.booking_reference}
          </div>
        </div>

        {/* nav */}
        <div style={{ display: 'flex', gap: '0', overflowX: 'auto' }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setActiveSection(n.id)} style={{
              padding: '12px 20px', background: 'none', border: 'none',
              borderBottom: activeSection === n.id ? '2px solid var(--amber)' : '2px solid transparent',
              color: activeSection === n.id ? '#F0EDE6' : '#555550',
              fontFamily: 'var(--sans)', fontSize: '12px', letterSpacing: '.08em',
              textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              {n.label}
            </button>
          ))}
        </div>
      </div>

      {/* content */}
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: 'clamp(24px,4vw,48px) clamp(20px,5vw,40px)' }}>

        {/* YOUR STAY */}
        {activeSection === 'stay' && (
          <div>
            {/* access code */}
            <div style={{ background: accessCode ? 'var(--noir)' : 'var(--linen)', border: `0.5px solid ${accessCode ? 'var(--noir)' : 'var(--sand)'}`, padding: '28px', marginBottom: '16px', textAlign: 'center' }}>
              {accessCode ? (
                <>
                  <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '10px' }}>Your access code</div>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: '64px', fontWeight: 300, color: '#F0EDE6', letterSpacing: '.2em', lineHeight: 1 }}>{accessCode}</div>
                  <div style={{ fontSize: '12px', color: '#555550', marginTop: '10px' }}>Enter this code on the keypad to unlock your suite.</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '8px' }}>Access code</div>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: '20px', fontWeight: 300, color: 'var(--noir)' }}>
                    {daysUntil > 2 ? `Available ${daysUntil - 2} days before check-in` : 'Available 48 hours before check-in'}
                  </div>
                </>
              )}
            </div>

            {/* stay details */}
            <div style={{ background: 'white', border: '0.5px solid var(--sand)', padding: '24px', marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>Stay details</div>
              {[
                { label: 'Check-in', value: `${format(checkIn, 'EEEE, MMMM d yyyy')} at ${booking.early_checkin_granted && booking.early_checkin_time ? booking.early_checkin_time : '4:00 PM'}${booking.early_checkin_granted ? ' ★ Early check-in approved' : ''}` },
                { label: 'Check-out', value: `${format(checkOut, 'EEEE, MMMM d yyyy')} at ${booking.late_checkout_granted && booking.late_checkout_time ? booking.late_checkout_time : '11:00 AM'}${booking.late_checkout_granted ? ' ★ Late checkout approved' : ''}` },
                { label: 'Guests', value: [booking.guests_adults && `${booking.guests_adults} adult${booking.guests_adults !== 1 ? 's' : ''}`, booking.guests_children && `${booking.guests_children} child${booking.guests_children !== 1 ? 'ren' : ''}`].filter(Boolean).join(', ') || (typeof booking.guests === 'number' ? `${booking.guests} guests` : '—') },
                { label: 'Instacart', value: booking.instacart_requested ? 'Requested — deliver to property address before check-in' : 'Not requested' },
                { label: 'Bag drop', value: booking.bag_drop && booking.bag_drop !== 'none' ? booking.bag_drop : 'Not requested' },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '0.5px solid var(--sand)', fontSize: '13px' }}>
                  <span style={{ color: 'var(--muted)' }}>{label}</span>
                  <span style={{ color: 'var(--noir)', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* house rules */}
            <div style={{ background: 'white', border: '0.5px solid var(--sand)', padding: '24px' }}>
              <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>House rules</div>
              {(booking.house_rules || [
                'No smoking on premises',
                'No parties or events',
                'Quiet hours 10pm – 8am',
                'Guests must be 25 or older to book',
              ]).map((rule: string) => (
                <div key={rule} style={{ fontSize: '13px', color: 'var(--muted)', padding: '8px 0', borderBottom: '0.5px solid var(--sand)' }}>{rule}</div>
              ))}
            </div>
          </div>
        )}

        {/* THE HOME */}
        {activeSection === 'home' && (
          <div>
            {/* search */}
            <div style={{ marginBottom: '24px' }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search — towels, WiFi, coffee..."
                style={{
                  width: '100%', padding: '14px 16px',
                  border: '0.5px solid var(--sand-mid)',
                  fontFamily: 'var(--sans)', fontSize: '14px',
                  color: 'var(--noir)', background: 'white', outline: 'none',
                  boxSizing: 'border-box' as const,
                }}
              />
            </div>

            {/* search results */}
            {search.length >= 2 && (
              <div style={{ marginBottom: '24px' }}>
                {searchResults.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--muted)', padding: '16px' }}>No results for "{search}"</div>
                ) : searchResults.map(g => (
                  <div key={g.id} style={{ background: 'white', border: '0.5px solid var(--sand)', padding: '16px 20px', marginBottom: '1px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '4px' }}>
                      {SECTION_LABELS[g.section] || g.section}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--noir)', fontWeight: 500, marginBottom: '4px' }}>{g.title}</div>
                    <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6 }}>
                      {g.content.split(new RegExp(`(${search})`, 'gi')).map((part: string, i: number) =>
                        part.toLowerCase() === search.toLowerCase()
                          ? <mark key={i} style={{ background: '#fef3c7', color: 'var(--noir)' }}>{part}</mark>
                          : part
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* guide sections */}
            {!search && Object.entries(guidesBySection).map(([section, items]) => (
              <div key={section} style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '20px' }}>{SECTION_ICONS[section] || '📌'}</span>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: '22px', fontWeight: 300, color: 'var(--noir)' }}>
                    {SECTION_LABELS[section] || section}
                  </div>
                </div>
                {items.sort((a, b) => a.display_order - b.display_order).map(g => (
                  <div key={g.id} style={{ background: 'white', border: '0.5px solid var(--sand)', padding: '16px 20px', marginBottom: '1px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--noir)', fontWeight: 500, marginBottom: '6px' }}>{g.title}</div>
                    <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.7 }}>{g.content}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* LOCAL GUIDE */}
        {activeSection === 'local' && (
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: 'var(--noir)', marginBottom: '24px' }}>
              What&apos;s nearby.
            </div>
            {pois.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Local guide coming soon.</div>
            ) : Object.entries(
              pois.reduce((acc: Record<string, any[]>, poi: any) => {
                if (!acc[poi.category]) acc[poi.category] = []
                acc[poi.category].push(poi)
                return acc
              }, {})
            ).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '12px' }}>{cat}</div>
                {(items as any[]).map((poi: any) => (
                  <div key={poi.id} style={{ background: 'white', border: '0.5px solid var(--sand)', padding: '14px 18px', marginBottom: '1px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '14px', color: 'var(--noir)', fontWeight: 500 }}>{poi.name}</div>
                    <div style={{ display: 'flex', gap: '10px', fontSize: '12px', color: 'var(--muted)' }}>
                      {poi.walkMins && <span>🚶 {poi.walkMins}min</span>}
                      {poi.driveMins && <span>🚗 {poi.driveMins}min</span>}
                      {poi.transitMins && <span>🚌 {poi.transitMins}min</span>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* PAYMENT */}
        {activeSection === 'payment' && (
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: 'var(--noir)', marginBottom: '24px' }}>
              Payment schedule.
            </div>
            {payments.map(({ label, amount, paid, due }) => (
              <div key={label} style={{ background: 'white', border: `0.5px solid ${paid ? 'var(--sand)' : 'var(--amber)'}`, padding: '20px 24px', marginBottom: '1px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '14px', color: 'var(--noir)', fontWeight: 500, marginBottom: '4px' }}>{label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{paid ? `Paid ${format(new Date(paid), 'MMM d, yyyy')}` : `Due ${due}`}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: '24px', fontWeight: 300, color: 'var(--noir)' }}>${amount?.toFixed(0)}</div>
                  <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: paid ? '#2ecc71' : 'var(--amber)', marginTop: '2px' }}>
                    {paid ? '✓ Paid' : 'Upcoming'}
                  </div>
                </div>
              </div>
            ))}
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '12px' }}>
              HST # {booking.hst_number || '[Your HST Number]'}
            </div>
          </div>
        )}

        {/* FAQ */}
        {activeSection === 'faq' && (
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: 'var(--noir)', marginBottom: '24px' }}>
              Common questions.
            </div>
            {(booking.faq || []).map((item: any, i: number) => (
              <FaqItem key={i} q={item.q} a={item.a} />
            ))}
            <div style={{ background: 'var(--linen)', border: '0.5px solid var(--sand)', padding: '24px', marginTop: '24px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', color: 'var(--noir)', marginBottom: '8px' }}>Still have questions?</div>
              <a href="mailto:hello@yourdomain.com" style={{ fontSize: '13px', color: 'var(--amber)', textDecoration: 'none', letterSpacing: '.06em' }}>
                Contact us directly →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '0.5px solid var(--sand)' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', textAlign: 'left', padding: '16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--noir)', fontFamily: 'var(--sans)' }}>{q}</span>
        <span style={{ fontSize: '18px', color: 'var(--amber)', transform: open ? 'rotate(45deg)' : 'none', transition: 'transform .2s', flexShrink: 0, marginLeft: '12px' }}>+</span>
      </button>
      {open && <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.7, paddingBottom: '16px' }}>{a}</div>}
    </div>
  )
}
