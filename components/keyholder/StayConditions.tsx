'use client'
import { useEffect, useState } from 'react'
import { L, F, microLabel, cardStyle } from '@/lib/design-tokens'

/*  Water drawn and wind blown during a stay.
 *
 *  Both existed on the legacy booking page and were never carried into this
 *  shell - not removed, never written in. The data never stopped: cistern_readings
 *  and wind_readings are both live and the cron keeps filling them. What was
 *  missing was somewhere to look.
 *
 *  THESE ARE NICKEL BEACH ONLY, and the guard is a fact about hardware, not a
 *  preference. The cistern is that property's water supply and the wind station
 *  is on its hot-tub cover; Royal York is on municipal water with no station at
 *  all. On a Royal York stay these must not render as empty cards implying
 *  missing data - there is no data to miss. So the guard returns null and the
 *  section does not exist.
 *
 *  The legacy cards read the same two endpoints and are still mounted on the
 *  legacy pages. This is a restyle to the current tokens, not a fork of the
 *  logic - same routes, same fields, nothing recomputed. */

export const HAS_SENSORS = (propertyId: string) => propertyId === 'nickel-beach'

const Card = ({ label, children }: { label: string; children: any }) => (
  <div style={{ ...cardStyle, padding: '18px 20px' }}>
    <div style={{ ...microLabel, marginBottom: '10px' }}>{label}</div>
    {children}
  </div>
)
const Big = ({ value, unit }: { value: string; unit: string }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
    <span style={{ fontFamily: F.serif, fontSize: '30px', fontWeight: 300, color: L.ink, lineHeight: 1 }}>{value}</span>
    <span style={{ fontSize: '12px', color: L.inkMuted }}>{unit}</span>
  </div>
)
const Quiet = ({ children }: { children: any }) => (
  <div style={{ fontSize: '12.5px', color: L.inkFaint, lineHeight: 1.5 }}>{children}</div>
)

export function WaterUsed({ propertyId, checkIn, checkOut }: { propertyId: string; checkIn: string; checkOut: string }) {
  const [stay, setStay] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!HAS_SENSORS(propertyId)) { setLoading(false); return }
    fetch(`/api/admin/cistern/usage?property=${propertyId}&checkIn=${checkIn}&checkOut=${checkOut}`)
      .then(r => r.json()).then(d => { if (d.stay) setStay(d.stay) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [propertyId, checkIn, checkOut])

  if (!HAS_SENSORS(propertyId) || loading) return null
  const enough = stay && stay.readingCount >= 2

  return (
    <Card label="Water used">
      {!enough ? (
        <Quiet>Not enough cistern readings for these dates yet — usage builds as readings accumulate.</Quiet>
      ) : (
        <>
          <Big value={`${stay.used}%`} unit={`of the cistern over ${stay.nights} night${stay.nights === 1 ? '' : 's'}`} />
          {stay.perNight != null && (
            <div style={{ fontSize: '12.5px', color: L.inkMuted, marginTop: '6px' }}>≈{stay.perNight}% a night</div>
          )}
          {stay.refillCount > 0 && (
            <div style={{ fontSize: '12px', color: L.inkFaint, marginTop: '6px' }}>
              {stay.refillCount} refill{stay.refillCount === 1 ? '' : 's'} during the stay (+{stay.refills}%) — usage is
              measured as drops only, so a refill does not cancel it out.
            </div>
          )}
        </>
      )}
    </Card>
  )
}

export function WindDuringStay({ propertyId, checkIn, checkOut, bookingId, bookingKind }: {
  propertyId: string; checkIn: string; checkOut: string; bookingId?: string; bookingKind?: 'direct' | 'platform'
}) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!HAS_SENSORS(propertyId)) { setLoading(false); return }
    const q = new URLSearchParams({ property: propertyId, checkIn, checkOut })
    if (bookingId) { q.set('bookingId', bookingId); q.set('bookingKind', bookingKind || 'platform') }
    fetch(`/api/admin/wind/stay?${q}`)
      .then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [propertyId, checkIn, checkOut, bookingId, bookingKind])

  if (!HAS_SENSORS(propertyId) || loading) return null
  const s = data?.summary || {}
  const count = data?.readingCount ?? 0

  return (
    <Card label="Wind during stay">
      {!count ? (
        <Quiet>No wind readings logged for these dates.</Quiet>
      ) : (
        <>
          <Big value={String(Math.round(s.maxGust ?? 0))} unit="km/h peak gust" />
          <div style={{ fontSize: '12.5px', color: L.inkMuted, marginTop: '6px' }}>
            {s.avgSustained != null && <>{s.avgSustained} km/h average sustained · </>}
            {count} hourly reading{count === 1 ? '' : 's'}
          </div>
          {(s.hoursHigh > 0 || s.hoursWatch > 0) && (
            <div style={{ fontSize: '12px', color: s.hoursHigh > 0 ? L.red : L.inkFaint, marginTop: '6px' }}>
              {s.hoursHigh > 0 && <>{s.hoursHigh}h at HIGH</>}
              {s.hoursHigh > 0 && s.hoursWatch > 0 && ' · '}
              {s.hoursWatch > 0 && <>{s.hoursWatch}h at WATCH</>}
              {' — kept for hot-tub cover damage claims.'}
            </div>
          )}
        </>
      )}
    </Card>
  )
}
