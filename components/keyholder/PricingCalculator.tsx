'use client'
import { useState } from 'react'
import { L, F, microLabel, cardStyle } from '@/lib/design-tokens'
import { quote, netOf, taxRateFor, type FeeKind, type Platform, type PlatformRate } from '@/lib/gross-up'

/*  THE POINT OF THIS SCREEN: decide by looking, not by guessing.
 *
 *  Katherine types what she wants to KEEP. Each platform's list price appears as
 *  she types, alongside what she lists today and what that actually nets — so the
 *  consequence of a target is visible before it is chosen, including the one that
 *  matters most: netting what her current nightly figures already say means
 *  raising the Airbnb list price by about 18%.
 *
 *  NOTHING IS SAVED FROM HERE YET. This is the instrument, not the commitment. */

const PLATFORM_LABEL: Record<Platform, string> = { houfy: 'Houfy', vrbo: 'VRBO', airbnb: 'Airbnb' }
const money = (v: number) => v.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function FeeRow({ propertyId, kind, label, sub, initialTarget, today, rates }: {
  propertyId: string
  kind: FeeKind
  label: string
  sub?: string
  initialTarget: number
  today: Partial<Record<Platform, number>>
  rates: PlatformRate[]
}) {
  const [target, setTarget] = useState(String(initialTarget))
  const n = Number(target)
  const valid = Number.isFinite(n) && n >= 0
  const quotes = valid ? quote(n, propertyId, kind, rates) : []
  const taxPct = (taxRateFor(propertyId, kind) * 100).toFixed(2)

  const nets = (Object.keys(today) as Platform[])
    .filter(p => today[p] != null)
    .map(p => netOf(today[p]!, p, propertyId, kind, rates))
  const spread = nets.length > 1 ? Math.max(...nets) - Math.min(...nets) : 0

  return (
    <div style={{ ...cardStyle, overflow: 'hidden', marginBottom: '18px' }}>
      <div style={{ padding: '16px 22px', background: L.cardAlt, borderBottom: `1px solid ${L.lineSoft}`, display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '190px' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: L.ink }}>{label}</div>
          {sub && <div style={{ fontSize: '12.5px', color: L.inkMuted, marginTop: '2px' }}>{sub}</div>}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 'none' }}>
          <span style={{ ...microLabel }}>You keep</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', border: `1px solid ${L.amberLine}`, background: L.amberWash, borderRadius: '8px', padding: '6px 10px' }}>
            <span style={{ fontSize: '15px', color: L.inkMuted }}>$</span>
            <input
              value={target}
              onChange={e => setTarget(e.target.value)}
              inputMode="decimal"
              style={{ width: '86px', border: 'none', background: 'transparent', outline: 'none', fontFamily: F.mono, fontSize: '17px', color: L.ink }}
            />
          </span>
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0', fontSize: '13px' }}>
        <div style={{ padding: '9px 22px', background: L.cardAlt, ...microLabel }}>Platform</div>
        <div style={{ padding: '9px 12px', background: L.cardAlt, ...microLabel, textAlign: 'right' }}>Guest pays</div>
        <div style={{ padding: '9px 12px', background: L.cardAlt, ...microLabel, textAlign: 'right' }}>You net</div>
        <div style={{ padding: '9px 22px', background: L.cardAlt, ...microLabel, textAlign: 'right' }}>vs today</div>

        {quotes.map(q => {
          const now = today[q.platform]
          const nowNet = now != null ? netOf(now, q.platform, propertyId, kind, rates) : null
          const delta = now != null ? (q.listPrice - now) / now : null
          return (
            <div key={q.platform} style={{ display: 'contents' }}>
              <div style={{ padding: '13px 22px', borderTop: `1px solid ${L.lineFaint}`, fontWeight: 600, color: L.ink }}>
                {PLATFORM_LABEL[q.platform]}
              </div>
              <div style={{ padding: '13px 12px', borderTop: `1px solid ${L.lineFaint}`, textAlign: 'right', fontFamily: F.mono, color: L.ink }}>
                {money(q.listPrice)}
              </div>
              <div style={{ padding: '13px 12px', borderTop: `1px solid ${L.lineFaint}`, textAlign: 'right', fontFamily: F.mono, fontWeight: 600, color: L.ink }}>
                {money(q.net)}
              </div>
              <div style={{ padding: '13px 22px', borderTop: `1px solid ${L.lineFaint}`, textAlign: 'right', color: L.inkMuted }}>
                {now == null ? '—' : (
                  <>
                    <span style={{ fontFamily: F.mono }}>{money(now)}</span>
                    <span style={{ color: L.inkFaint }}> → nets {money(nowNet!)}</span>
                    {delta != null && Math.abs(delta) > 0.005 && (
                      <span style={{ fontWeight: 600, color: delta > 0 ? L.amber : L.inkBody }}>
                        {'  '}{delta > 0 ? '▲' : '▼'}{Math.abs(delta * 100).toFixed(0)}%
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ padding: '12px 22px', borderTop: `1px solid ${L.lineFaint}`, fontSize: '12.5px', color: L.inkBody, lineHeight: 1.55 }}>
        {spread > 0.005 ? (
          <>Today the same {label.toLowerCase()} nets a <strong style={{ color: L.ink }}>${money(spread)}</strong> spread across
            platforms. At one target, all three net the same.</>
        ) : (
          <>All three net the same amount at this target.</>
        )}
        {' '}VRBO&apos;s 3% processing is charged on the tax-inclusive total, so its price carries this fee&apos;s {taxPct}% tax rate.
      </div>
    </div>
  )
}


/*  EXTRA GUEST — a rule, not a number.
 *
 *  $75 per guest per night above the property's maximum, so the charge depends on
 *  the booking rather than sitting in a column. Katherine sets the RATE; the
 *  worked example below it shows what that rate produces for a given overage and
 *  length, grossed up per platform, because "$75" and "what a family of twelve
 *  actually pays for four nights" are different questions and only the second one
 *  is decidable by looking.
 *
 *  Tax: HST only, matching how computeTaxSplit already treats extras. This was
 *  put to Katherine as an open question — a per-night, per-person charge could be
 *  read as accommodation, which would attract MAT — and she has answered it:
 *  accommodation is the stay itself, and a surcharge is a fee on top of it. HST
 *  only, no MAT. Settled; don't reopen it. */
function ExtraGuestRow({ propertyId, maxGuests, initialRate, rates }: {
  propertyId: string
  maxGuests: number
  initialRate: number
  rates: PlatformRate[]
}) {
  const [rate, setRate] = useState(String(initialRate))
  const [over, setOver] = useState('2')
  const [nights, setNights] = useState('4')

  const r = Number(rate), o = Number(over), n = Number(nights)
  const valid = [r, o, n].every(v => Number.isFinite(v) && v >= 0)
  const targetNet = valid ? r * o * n : 0
  const quotes = valid && targetNet > 0 ? quote(targetNet, propertyId, 'extra_guest', rates) : []

  const numBox = (v: string, set: (s: string) => void, w = '64px') => (
    <span style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${L.line}`, borderRadius: '7px', padding: '4px 9px', background: L.card }}>
      <input value={v} onChange={e => set(e.target.value)} inputMode="decimal"
        style={{ width: w, border: 'none', background: 'transparent', outline: 'none', fontFamily: F.mono, fontSize: '15px', color: L.ink }} />
    </span>
  )

  return (
    <div style={{ ...cardStyle, overflow: 'hidden', marginBottom: '18px' }}>
      <div style={{ padding: '16px 22px', background: L.cardAlt, borderBottom: `1px solid ${L.lineSoft}`, display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '190px' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: L.ink }}>Extra guest</div>
          <div style={{ fontSize: '12.5px', color: L.inkMuted, marginTop: '2px' }}>
            Per guest per night above {maxGuests}, this property&apos;s maximum
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 'none' }}>
          <span style={microLabel}>You keep, per guest per night</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', border: `1px solid ${L.amberLine}`, background: L.amberWash, borderRadius: '8px', padding: '6px 10px' }}>
            <span style={{ fontSize: '15px', color: L.inkMuted }}>$</span>
            {numBox(rate, setRate, '58px')}
          </span>
        </label>
      </div>

      <div style={{ padding: '15px 22px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '14px', color: L.inkBody, borderBottom: `1px solid ${L.lineFaint}` }}>
        <span>A booking with</span>
        {numBox(over, setOver, '46px')}
        <span>guest{o === 1 ? '' : 's'} over {maxGuests}, staying</span>
        {numBox(nights, setNights, '46px')}
        <span>night{n === 1 ? '' : 's'} —</span>
        <strong style={{ color: L.ink, fontFamily: F.mono }}>
          {o} x {n} x ${rate} = ${money(targetNet)}
        </strong>
        <span>to keep</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '13px' }}>
        <div style={{ padding: '9px 22px', background: L.cardAlt, ...microLabel }}>Platform</div>
        <div style={{ padding: '9px 12px', background: L.cardAlt, ...microLabel, textAlign: 'right' }}>Guest pays</div>
        <div style={{ padding: '9px 22px', background: L.cardAlt, ...microLabel, textAlign: 'right' }}>You net</div>
        {quotes.map(q => (
          <div key={q.platform} style={{ display: 'contents' }}>
            <div style={{ padding: '13px 22px', borderTop: `1px solid ${L.lineFaint}`, fontWeight: 600, color: L.ink }}>{PLATFORM_LABEL[q.platform]}</div>
            <div style={{ padding: '13px 12px', borderTop: `1px solid ${L.lineFaint}`, textAlign: 'right', fontFamily: F.mono, color: L.ink }}>{money(q.listPrice)}</div>
            <div style={{ padding: '13px 22px', borderTop: `1px solid ${L.lineFaint}`, textAlign: 'right', fontFamily: F.mono, fontWeight: 600, color: L.ink }}>{money(q.net)}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 22px', borderTop: `1px solid ${L.lineFaint}`, fontSize: '12.5px', color: L.inkBody, lineHeight: 1.55 }}>
        The rate is what you keep per guest per night — the charge itself is worked out per booking from
        the guest count and length, so nothing here is a stored total. HST only, the same as cleaning:
        it&apos;s a fee on top of the stay, not accommodation, so no MAT rides on it.
      </div>
    </div>
  )
}

export default function PricingCalculator({ propertyId, propertyName, base, weekend, overrides, todayCleaning, maxGuests, rates }: {
  propertyId: string
  propertyName: string
  base: number
  weekend: number | null
  overrides: { start_date: string; end_date: string; rate: number; label?: string | null }[]
  todayCleaning: Partial<Record<Platform, number>>
  maxGuests: number
  /*  Loaded from platform_rates by the page, never the constant. The write path
   *  reads the same rows through the same loader, so the price Katherine decides
   *  against and the price that goes live cannot come from different numbers. */
  rates: PlatformRate[]
}) {
  return (
    <div style={{ paddingTop: '24px', display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '980px' }}>
      <span style={{ fontFamily: F.serif, fontSize: '34px', lineHeight: 1 }}>Pricing</span>
      <p style={{ fontSize: '14px', color: L.inkBody, lineHeight: 1.6, marginBottom: '14px', maxWidth: '640px' }}>
        Enter what you want to <strong style={{ color: L.ink }}>keep</strong>. Each platform&apos;s price is worked
        backwards from it, so the same night or the same clean nets you the same amount whoever books it.
        Nothing here is saved yet — change the numbers and watch what happens.
      </p>

      <FeeRow propertyId={propertyId} kind="nightly" label="Nightly — base rate"
        sub="Low season, and the fallback for any date without an override"
        initialTarget={base} today={{ airbnb: base, vrbo: base, houfy: base }} rates={rates} />

      {weekend != null && (
        <FeeRow propertyId={propertyId} kind="nightly" label="Nightly — weekend"
          initialTarget={weekend} today={{ airbnb: weekend, vrbo: weekend, houfy: weekend }} rates={rates} />
      )}

      {overrides.map(o => (
        <FeeRow key={`${o.start_date}-${o.end_date}`} propertyId={propertyId} kind="nightly"
          label={`Nightly — ${o.label || 'override'}`}
          sub={`${o.start_date} to ${o.end_date}`}
          initialTarget={Number(o.rate)} today={{ airbnb: Number(o.rate), vrbo: Number(o.rate), houfy: Number(o.rate) }} rates={rates} />
      ))}

      <FeeRow propertyId={propertyId} kind="cleaning" label="Cleaning"
        sub="Charged once per stay. MAT does not apply, so only HST rides on it."
        initialTarget={todayCleaning.houfy ?? 0} today={todayCleaning} rates={rates} />

      <FeeRow propertyId={propertyId} kind="pet" label="Pet"
        sub="Flat, once per stay, every platform"
        initialTarget={199} today={{ airbnb: 199 }} rates={rates} />

      <ExtraGuestRow propertyId={propertyId} maxGuests={maxGuests} initialRate={75} rates={rates} />

      <div style={{ ...cardStyle, padding: '18px 22px', fontSize: '13px', color: L.inkBody, lineHeight: 1.6 }}>
        <strong style={{ color: L.ink }}>Nothing is saved from this screen.</strong> It is here so the
        decision is made against real numbers. Airbnb takes 15.5% of the accommodation, VRBO 5% plus 3%
        payment processing on the tax-inclusive total, and Houfy takes no host commission at all — the 17%
        a Houfy guest sees is tax, not a fee.
      </div>
    </div>
  )
}
