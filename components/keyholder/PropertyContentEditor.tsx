'use client'
import { useState } from 'react'
import { L, F, microLabel, cardStyle } from '@/lib/design-tokens'

/*  Editing the words guests read.
 *
 *  NO DRAFT STATE, AND THE BANNER SAYS SO. Every surface reads the properties
 *  table directly, so a save is live on the listing, the hub and the concierge
 *  before Katherine has closed the tab. A draft state would be the safer-sounding
 *  choice and the worse one: the failure mode of "publish later" is a corrected
 *  house rule that sits unpublished, which is precisely the thing the guest
 *  needed. Better to be honest that the button is the publish button.
 *
 *  THE TWO LOCATION FIELDS ARE THE POINT OF THIS SCREEN. An approximate centre
 *  and a street address are one text box apart and a world apart in consequence,
 *  and the version of this editor that lists them as "map_offset" and "address"
 *  among thirty other inputs is the version that leaks a house. They are pulled
 *  out, labelled by WHO SEES THEM rather than by what they are called in the
 *  database, and the one that is never public says so on its face.
 *
 *  FOUR FIELDS ARE SHOWN BUT NOT EDITABLE — min stay, check-in, check-out and
 *  cleaning. Each lives in more than one table and they already disagree; an
 *  editor that wrote one copy would deepen the split while appearing to fix it.
 *  They are here because leaving them out entirely would send Katherine hunting
 *  through the legacy admin for them. */

type Props = { property: any; canEdit: boolean; siteUrl: string }

const label = (t: string) => <div style={{ ...microLabel, marginBottom: '6px' }}>{t}</div>

export default function PropertyContentEditor({ property, canEdit, siteUrl }: Props) {
  const [f, setF] = useState<Record<string, any>>({ ...property })
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<any>(null)

  const set = (k: string, v: any) => { setF(s => ({ ...s, [k]: v })); setResult(null) }
  const dirty = Object.keys(f).filter(k => JSON.stringify(f[k]) !== JSON.stringify(property[k]))

  const FIELDS = [
    'name', 'neighbourhood', 'city', 'tagline', 'description', 'area_description',
    'beds', 'baths', 'max_guests', 'sqft', 'amenities', 'highlights', 'house_rules', 'faq',
    'houfy_url', 'airbnb_url', 'vrbo_url', 'parking_spots', 'security_deposit',
    'str_registration', 'cancellation_policy', 'early_checkin_available',
    'earliest_checkin_time', 'latest_checkout_time', 'bag_drop_available',
    'instacart_available', 'instacart_cutoff_hours', 'address', 'map_offset',
  ]

  async function save() {
    setSaving(true); setResult(null)
    const body: Record<string, any> = {}
    for (const k of FIELDS) if (dirty.includes(k)) body[k] = f[k]
    const r = await fetch(`/api/keyholder/property/${property.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const j = await r.json().catch(() => ({}))
    setSaving(false)
    setResult(r.ok ? { ok: true, changed: j.changed || [] } : { ok: false, ...j })
    if (r.ok) window.location.reload()
  }

  const input: React.CSSProperties = {
    width: '100%', padding: '9px 11px', boxSizing: 'border-box', borderRadius: '8px',
    border: `1px solid ${L.line}`, background: L.card, fontSize: '14px', color: L.ink,
    outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
  }
  const Text = ({ k, rows = 1, ph }: { k: string; rows?: number; ph?: string }) =>
    rows > 1
      ? <textarea value={f[k] ?? ''} placeholder={ph} rows={rows} disabled={!canEdit}
          onChange={e => set(k, e.target.value)} style={{ ...input, resize: 'vertical' }} />
      : <input value={f[k] ?? ''} placeholder={ph} disabled={!canEdit}
          onChange={e => set(k, e.target.value)} style={input} />
  const Num = ({ k }: { k: string }) => (
    <input value={f[k] ?? ''} inputMode="numeric" disabled={!canEdit}
      onChange={e => set(k, e.target.value === '' ? null : Number(e.target.value))}
      style={{ ...input, fontFamily: F.mono }} />
  )
  const Check = ({ k, t }: { k: string; t: string }) => (
    <label style={{ display: 'flex', gap: '9px', alignItems: 'center', fontSize: '14px', color: L.inkBody, cursor: canEdit ? 'pointer' : 'default' }}>
      <input type="checkbox" checked={!!f[k]} disabled={!canEdit} onChange={e => set(k, e.target.checked)} />
      {t}
    </label>
  )

  /* A list of lines is a textarea. Three buttons per bullet is a worse tool than
     a box you can paste into and reorder by moving a line. */
  const Lines = ({ k, help }: { k: string; help: string }) => (
    <>
      <textarea
        value={(f[k] || []).join('\n')} disabled={!canEdit} rows={Math.max(3, (f[k] || []).length + 1)}
        onChange={e => set(k, e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
        style={{ ...input, resize: 'vertical', fontSize: '13.5px' }} />
      <div style={{ fontSize: '12px', color: L.inkFaint, marginTop: '5px' }}>{help} · one per line · {(f[k] || []).length} now</div>
    </>
  )

  const faq: { q: string; a: string }[] = f.faq || []
  const setFaq = (i: number, key: 'q' | 'a', v: string) =>
    set('faq', faq.map((x, j) => j === i ? { ...x, [key]: v } : x))

  const section: React.CSSProperties = { ...cardStyle, padding: '22px 24px', marginBottom: '18px' }
  const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }

  return (
    <div style={{ paddingBottom: '100px' }}>

      {/* ── what saving actually does ── */}
      <div style={{
        ...cardStyle, padding: '15px 20px', marginBottom: '20px',
        background: L.amberWash, border: `1px solid ${L.amberLine}`,
        display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: '260px', fontSize: '13.5px', color: L.ink, lineHeight: 1.55 }}>
          <strong>Changes here are live as soon as you save</strong> — on the guest hub, the public
          listing and the concierge. There is no draft.
        </div>
        <a href={`${siteUrl}/property/${property.id}`} target="_blank" rel="noreferrer"
          style={{ fontSize: '13px', fontWeight: 600, color: L.link, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          View live →
        </a>
      </div>

      {/* ── the listing ── */}
      <div style={section}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: L.ink, marginBottom: '16px' }}>The listing</div>
        <div style={row}>
          <div>{label('Name')}<Text k="name" /></div>
          <div>{label('Neighbourhood')}<Text k="neighbourhood" /></div>
        </div>
        <div style={{ marginBottom: '16px' }}>{label('City')}<Text k="city" /></div>
        <div style={{ marginBottom: '16px' }}>{label('Tagline')}<Text k="tagline" ph="One line, shown under the name" /></div>
        <div style={{ marginBottom: '16px' }}>{label('Description')}<Text k="description" rows={5} /></div>
        <div>{label('About the area')}<Text k="area_description" rows={4} /></div>
      </div>

      {/* ── the two location fields ── */}
      <div style={section}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: L.ink, marginBottom: '4px' }}>Where the property is</div>
        <div style={{ fontSize: '13px', color: L.inkMuted, marginBottom: '18px', lineHeight: 1.55 }}>
          Two different places, on purpose. One is for anyone who finds the listing; the other is for
          someone who has booked it.
        </div>

        <div style={{ padding: '16px 18px', borderRadius: '10px', border: `1px solid ${L.line}`, marginBottom: '14px' }}>
          {label('What the public sees')}
          <div style={{ fontSize: '13px', color: L.inkBody, marginBottom: '10px', lineHeight: 1.5 }}>
            An approximate centre — roughly 300m off the house — drawn as the circle on the
            neighbourhood map. Never the exact address.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', color: L.inkFaint, marginBottom: '4px' }}>Latitude</div>
              <input value={f.map_offset?.lat ?? ''} disabled={!canEdit} inputMode="decimal"
                onChange={e => set('map_offset', { ...(f.map_offset || {}), lat: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ ...input, fontFamily: F.mono }} />
            </div>
            <div>
              <div style={{ fontSize: '12px', color: L.inkFaint, marginBottom: '4px' }}>Longitude</div>
              <input value={f.map_offset?.lng ?? ''} disabled={!canEdit} inputMode="decimal"
                onChange={e => set('map_offset', { ...(f.map_offset || {}), lng: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ ...input, fontFamily: F.mono }} />
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 18px', borderRadius: '10px', border: `1px solid ${L.amberLine}`, background: L.amberWash }}>
          {label('What booked guests see')}
          <div style={{ fontSize: '13px', color: L.inkBody, marginBottom: '10px', lineHeight: 1.5 }}>
            The exact address. Shown automatically 24 hours before check-in; earlier requests come to
            you to approve. It never appears on a public page.
          </div>
          <Text k="address" ph="Street, unit, city, postal code" />
        </div>
      </div>

      {/* ── what's in the place ── */}
      <div style={section}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: L.ink, marginBottom: '16px' }}>The place itself</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '18px' }}>
          <div>{label('Bedrooms')}<Num k="beds" /></div>
          <div>{label('Bathrooms')}<Num k="baths" /></div>
          <div>{label('Sleeps')}<Num k="max_guests" /></div>
          <div>{label('Square feet')}<Num k="sqft" /></div>
        </div>
        <div style={{ marginBottom: '18px' }}>{label('Amenities')}<Lines k="amenities" help="What the place has" /></div>
        <div style={{ marginBottom: '18px' }}>{label('Highlights')}<Lines k="highlights" help="The reasons to book it" /></div>
        <div>{label('House rules')}<Lines k="house_rules" help="What guests agree to" /></div>
      </div>

      {/* ── questions ── */}
      <div style={section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: L.ink }}>Questions guests ask</span>
          {canEdit && <button onClick={() => set('faq', [...faq, { q: '', a: '' }])} style={{
            padding: '6px 12px', borderRadius: '7px', border: `1px solid ${L.line}`,
            background: L.card, color: L.inkBody, fontSize: '12.5px', fontWeight: 600, cursor: 'pointer',
          }}>Add a question</button>}
        </div>
        {faq.length === 0 && <div style={{ fontSize: '13px', color: L.inkFaint }}>None yet.</div>}
        {faq.map((x, i) => (
          <div key={i} style={{ marginBottom: '14px', paddingBottom: '14px', borderBottom: i < faq.length - 1 ? `1px solid ${L.lineFaint}` : 'none' }}>
            <input value={x.q} placeholder="The question" disabled={!canEdit}
              onChange={e => setFaq(i, 'q', e.target.value)} style={{ ...input, fontWeight: 600, marginBottom: '7px' }} />
            <textarea value={x.a} placeholder="The answer" rows={2} disabled={!canEdit}
              onChange={e => setFaq(i, 'a', e.target.value)} style={{ ...input, resize: 'vertical' }} />
            {canEdit && <button onClick={() => set('faq', faq.filter((_, j) => j !== i))} style={{
              marginTop: '6px', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontSize: '12px', color: L.red, textDecoration: 'underline', textUnderlineOffset: '3px',
            }}>Remove</button>}
          </div>
        ))}
      </div>

      {/* ── arrival ── */}
      <div style={section}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: L.ink, marginBottom: '16px' }}>Arriving and leaving</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '16px' }}>
          <div>{label('Parking spots')}<Num k="parking_spots" /></div>
          <div>{label('Earliest check-in')}<Text k="earliest_checkin_time" ph="10:00" /></div>
          <div>{label('Latest checkout')}<Text k="latest_checkout_time" ph="14:00" /></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          <Check k="early_checkin_available" t="Early check-in can be requested" />
          <Check k="bag_drop_available" t="Bags can be dropped before check-in" />
          <Check k="instacart_available" t="Groceries can be pre-ordered" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
          <div>{label('Grocery cutoff (hours)')}<Num k="instacart_cutoff_hours" /></div>
          <div>{label('Security deposit')}<Num k="security_deposit" /></div>
          <div>
            {label('Cancellation')}
            <select value={f.cancellation_policy || ''} disabled={!canEdit}
              onChange={e => set('cancellation_policy', e.target.value)} style={input}>
              <option value="moderate">Moderate</option>
              <option value="strict">Strict</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── read-only, and why ── */}
      <div style={{ ...section, background: L.cardAlt }}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: L.ink, marginBottom: '4px' }}>Set somewhere else</div>
        <div style={{ fontSize: '13px', color: L.inkBody, marginBottom: '16px', lineHeight: 1.6 }}>
          These are shown for reference and cannot be changed here. Each is stored in more than one
          table and the copies already disagree — editing one of them would make that worse while
          looking like a fix. Reconciling them is its own piece of work.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
          {[['Minimum stay', property.min_stay ? `${property.min_stay} nights` : '—'],
            ['Check-in', property.check_in || '—'],
            ['Checkout', property.check_out || '—'],
            ['Cleaning', 'per platform']].map(([k, v]) => (
            <div key={k}>
              <div style={{ ...microLabel, marginBottom: '5px' }}>{k}</div>
              <div style={{ fontSize: '15px', color: L.inkMuted, fontFamily: F.mono }}>{v}</div>
            </div>
          ))}
        </div>
        <a href={`/keyholder/property/${property.id}/pricing`}
          style={{ display: 'inline-block', marginTop: '14px', fontSize: '13px', fontWeight: 600, color: L.link, textDecoration: 'none' }}>
          Go to Pricing →
        </a>
      </div>

      {/* ── where it's listed ── */}
      <div style={section}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: L.ink, marginBottom: '16px' }}>Where it&apos;s listed</div>
        <div style={{ marginBottom: '14px' }}>{label('Houfy — where guests book')}<Text k="houfy_url" ph="https://houfy.com/…" /></div>
        <div style={row}>
          <div>{label('Airbnb')}<Text k="airbnb_url" /></div>
          <div>{label('VRBO')}<Text k="vrbo_url" /></div>
        </div>
        <div>{label('Registration number')}<Text k="str_registration" /></div>
      </div>

      {/* ── save ── */}
      {canEdit && (
        <div style={{
          position: 'sticky', bottom: 0, padding: '16px 20px', marginTop: '8px',
          background: L.card, borderTop: `1px solid ${L.line}`, borderRadius: '12px 12px 0 0',
          display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
          boxShadow: '0 -4px 18px rgba(0,0,0,.05)',
        }}>
          <button onClick={save} disabled={saving || dirty.length === 0} style={{
            padding: '10px 20px', borderRadius: '9px', border: 'none', cursor: dirty.length ? 'pointer' : 'default',
            background: dirty.length ? L.ink : L.line, color: dirty.length ? L.onInk : L.inkFaint,
            fontSize: '14px', fontWeight: 600,
          }}>{saving ? 'Saving…' : 'Save — this goes live'}</button>
          <span style={{ fontSize: '13px', color: L.inkMuted }}>
            {dirty.length === 0 ? 'Nothing changed yet'
              : `${dirty.length} field${dirty.length === 1 ? '' : 's'} changed`}
          </span>
          {result && !result.ok && (
            <span style={{ fontSize: '13px', color: L.red }}>
              {result.error}{result.rejected ? ` — ${result.rejected.join(', ')}` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
