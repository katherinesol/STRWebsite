'use client'
import { useMemo, useState } from 'react'
import Map, { Marker } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { L, F, microLabel, cardStyle } from '@/lib/design-tokens'
import { CATEGORIES, CATEGORY, categoryColour, categoryPath, categoryLabel, type Category } from '@/lib/poi-categories'

/*  Fixing eighteen pins that were placed from memory.
 *
 *  DRAGGING IS THE PRIMARY EDIT, because the mistake these pins have is spatial
 *  and typing numbers cannot show you a spatial mistake. Every pin was estimated
 *  rather than looked up, so the fix is to see the pin sitting in the wrong place
 *  and move it onto the right one — a decimal place in a text box is the way
 *  they got wrong in the first place. Pasting a coordinate is kept as the
 *  secondary path for when the number came from somewhere trustworthy.
 *
 *  THE ICONS ARE SHARED WITH THE GUEST MAP, from lib/poi-categories. An editor
 *  that drew its own pins would drift from the listing, and Katherine would be
 *  positioning a symbol the guest never sees.
 *
 *  NOTHING IS VALIDATED LOOSELY HERE AND STRICTLY ON THE SERVER. The same rules
 *  run in both places and the server's answer is the one that counts — this copy
 *  exists so a problem is visible beside the field rather than after a failed
 *  save. The save button refuses while anything is invalid, and the server
 *  refuses the WHOLE array if one entry is wrong, so a place that did not land
 *  can never be mistaken for one that did. */

type Poi = { id?: string; name: string; category: Category; lat: any; lng: any; walkMins?: any; driveMins?: any; transitMins?: any; note?: string }

const num = (v: any) => v === '' || v == null ? null : Number(v)
const finite = (v: any) => typeof v === 'number' && Number.isFinite(v)

function problems(p: Poi): Record<string, string> {
  const e: Record<string, string> = {}
  if (!String(p.name || '').trim()) e.name = 'Needs a name'
  if (!CATEGORIES.includes(p.category)) e.category = 'Pick a kind'
  if (!finite(num(p.lat))) e.lat = 'Needs a latitude'
  else if (num(p.lat)! < -90 || num(p.lat)! > 90) e.lat = '−90 to 90'
  if (!finite(num(p.lng))) e.lng = 'Needs a longitude'
  else if (num(p.lng)! < -180 || num(p.lng)! > 180) e.lng = '−180 to 180'
  for (const k of ['walkMins', 'driveMins'] as const) {
    const v = num((p as any)[k])
    if (v == null) continue
    if (!finite(v) || !Number.isInteger(v) || v <= 0) e[k] = 'Whole minutes, above zero'
  }
  return e
}

const Pin = ({ category, size = 26, dim = false }: { category: string; size?: number; dim?: boolean }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center',
    background: dim ? L.line : categoryColour(category),
    border: `2px solid ${L.card}`, boxShadow: '0 1px 5px rgba(0,0,0,.3)',
  }}>
    <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none"
      stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={categoryPath(category)} />
    </svg>
  </div>
)

export default function PlacesEditor({ property, canEdit, token }: { property: any; canEdit: boolean; token?: string }) {
  const centre = property.map_offset || { lat: 43.65, lng: -79.38 }
  const [pois, setPois] = useState<Poi[]>(() => (property.pois || []).map((p: any) => ({ ...p })))
  const [active, setActive] = useState<number | null>(null)
  const [paste, setPaste] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<any>(null)

  const errs = useMemo(() => pois.map(problems), [pois])
  const badCount = errs.filter(e => Object.keys(e).length).length
  const dirty = JSON.stringify(pois) !== JSON.stringify(property.pois || [])

  const set = (i: number, patch: Partial<Poi>) => {
    setPois(s => s.map((p, j) => j === i ? { ...p, ...patch } : p)); setResult(null)
  }

  function applyPaste(i: number, raw: string) {
    const m = raw.split(/[, ]+/).map(s => s.trim()).filter(Boolean)
    if (m.length >= 2 && finite(Number(m[0])) && finite(Number(m[1]))) {
      set(i, { lat: Number(m[0]), lng: Number(m[1]) }); setPaste('')
    }
  }

  async function save() {
    setSaving(true); setResult(null)
    const clean = pois.map(p => ({
      ...(p.id ? { id: p.id } : {}),
      name: String(p.name).trim(), category: p.category,
      lat: num(p.lat), lng: num(p.lng),
      ...(num(p.walkMins) != null ? { walkMins: num(p.walkMins) } : {}),
      ...(num(p.driveMins) != null ? { driveMins: num(p.driveMins) } : {}),
      ...(num(p.transitMins) != null ? { transitMins: num(p.transitMins) } : {}),
      ...(p.note ? { note: p.note } : {}),
    }))
    const r = await fetch(`/api/keyholder/property/${property.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pois: clean }),
    })
    const j = await r.json().catch(() => ({}))
    setSaving(false); setResult({ ok: r.ok, ...j })
    if (r.ok) setTimeout(() => window.location.reload(), 900)
  }

  const input: React.CSSProperties = {
    width: '100%', padding: '7px 9px', boxSizing: 'border-box', borderRadius: '7px',
    border: `1px solid ${L.line}`, background: L.card, fontSize: '13.5px', color: L.ink,
    outline: 'none', fontFamily: 'inherit',
  }
  const bad: React.CSSProperties = { border: `1px solid ${L.redLine}`, background: L.redWash }

  return (
    <div style={{ paddingBottom: '110px' }}>

      <div style={{
        ...cardStyle, padding: '15px 20px', marginBottom: '18px',
        background: L.amberWash, border: `1px solid ${L.amberLine}`, fontSize: '13.5px', color: L.ink, lineHeight: 1.6,
      }}>
        <strong>Drag a pin to move it.</strong> These distances show on the public listing and in the
        guest hub, so a pin in the wrong place is a wrong walk time on a live page. Saving publishes
        immediately.
      </div>

      {/* ── the map ── */}
      {token ? (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', height: '440px', marginBottom: '18px' }}>
          <Map
            mapboxAccessToken={token}
            initialViewState={{ longitude: centre.lng, latitude: centre.lat, zoom: 13 }}
            mapStyle="mapbox://styles/mapbox/light-v11"
            style={{ width: '100%', height: '100%' }}
          >
            <Marker longitude={centre.lng} latitude={centre.lat}>
              <div title="Approximate location shown publicly" style={{
                width: '18px', height: '18px', borderRadius: '50%',
                background: 'rgba(26,26,24,.18)', border: `2px solid ${L.ink}`,
              }} />
            </Marker>

            {pois.map((p, i) => {
              const ok = finite(num(p.lat)) && finite(num(p.lng))
              if (!ok) return null
              return (
                <Marker key={i} longitude={num(p.lng)!} latitude={num(p.lat)!}
                  draggable={canEdit}
                  onDragEnd={e => set(i, { lat: Number(e.lngLat.lat.toFixed(6)), lng: Number(e.lngLat.lng.toFixed(6)) })}
                  onClick={() => setActive(i)}>
                  <div style={{ cursor: canEdit ? 'grab' : 'pointer', transform: active === i ? 'scale(1.25)' : 'none', transition: 'transform .12s' }}>
                    <Pin category={p.category} size={active === i ? 30 : 26} />
                  </div>
                </Marker>
              )
            })}
          </Map>
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: '20px', marginBottom: '18px', fontSize: '13px', color: L.inkMuted }}>
          The map needs a Mapbox token to draw. Coordinates can still be edited below.
        </div>
      )}

      {/* ── the legend, which is also the icon key guests see ── */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '18px' }}>
        {CATEGORIES.map(c => (
          <span key={c} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', color: L.inkMuted }}>
            <Pin category={c} size={20} /> {CATEGORY[c].label}
          </span>
        ))}
      </div>

      {/* ── the list ── */}
      {pois.map((p, i) => {
        const e = errs[i]
        return (
          <div key={i} onFocus={() => setActive(i)} style={{
            ...cardStyle, padding: '16px 18px', marginBottom: '12px',
            border: active === i ? `1px solid ${L.ink}` : Object.keys(e).length ? `1px solid ${L.redLine}` : `1px solid ${L.line}`,
          }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '12px' }}>
              <Pin category={p.category} />
              <div style={{ flex: 1 }}>
                <input value={p.name} disabled={!canEdit} placeholder="What is this place called?"
                  onChange={ev => set(i, { name: ev.target.value })}
                  style={{ ...input, fontSize: '15px', fontWeight: 600, ...(e.name ? bad : {}) }} />
                {e.name && <div style={{ fontSize: '12px', color: L.red, marginTop: '4px' }}>{e.name}</div>}
              </div>
              {canEdit && (
                <button onClick={() => { setPois(s => s.filter((_, j) => j !== i)); setResult(null) }} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                  fontSize: '12.5px', color: L.red, textDecoration: 'underline', textUnderlineOffset: '3px',
                }}>Remove</button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr .8fr .8fr', gap: '10px' }}>
              <div>
                <div style={{ ...microLabel, marginBottom: '4px' }}>Kind</div>
                <select value={p.category} disabled={!canEdit} onChange={ev => set(i, { category: ev.target.value as Category })}
                  style={{ ...input, ...(e.category ? bad : {}) }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                </select>
              </div>
              <div>
                <div style={{ ...microLabel, marginBottom: '4px' }}>Latitude</div>
                <input value={p.lat ?? ''} disabled={!canEdit} inputMode="decimal"
                  onChange={ev => set(i, { lat: ev.target.value })}
                  style={{ ...input, fontFamily: F.mono, ...(e.lat ? bad : {}) }} />
                {e.lat && <div style={{ fontSize: '11.5px', color: L.red, marginTop: '3px' }}>{e.lat}</div>}
              </div>
              <div>
                <div style={{ ...microLabel, marginBottom: '4px' }}>Longitude</div>
                <input value={p.lng ?? ''} disabled={!canEdit} inputMode="decimal"
                  onChange={ev => set(i, { lng: ev.target.value })}
                  style={{ ...input, fontFamily: F.mono, ...(e.lng ? bad : {}) }} />
                {e.lng && <div style={{ fontSize: '11.5px', color: L.red, marginTop: '3px' }}>{e.lng}</div>}
              </div>
              <div>
                <div style={{ ...microLabel, marginBottom: '4px' }}>Walk</div>
                <input value={p.walkMins ?? ''} disabled={!canEdit} inputMode="numeric" placeholder="—"
                  onChange={ev => set(i, { walkMins: ev.target.value })}
                  style={{ ...input, fontFamily: F.mono, ...(e.walkMins ? bad : {}) }} />
              </div>
              <div>
                <div style={{ ...microLabel, marginBottom: '4px' }}>Drive</div>
                <input value={p.driveMins ?? ''} disabled={!canEdit} inputMode="numeric" placeholder="—"
                  onChange={ev => set(i, { driveMins: ev.target.value })}
                  style={{ ...input, fontFamily: F.mono, ...(e.driveMins ? bad : {}) }} />
              </div>
            </div>

            {active === i && canEdit && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '12.5px', color: L.inkFaint }}>Or paste a coordinate</span>
                <input value={paste} placeholder="42.873, -79.2477"
                  onChange={ev => setPaste(ev.target.value)}
                  onKeyDown={ev => { if (ev.key === 'Enter') applyPaste(i, paste) }}
                  onBlur={() => paste && applyPaste(i, paste)}
                  style={{ ...input, width: '200px', fontFamily: F.mono }} />
              </div>
            )}
          </div>
        )
      })}

      {canEdit && (
        <button onClick={() => {
          setPois(s => [...s, { name: '', category: 'attraction', lat: centre.lat, lng: centre.lng }])
          setActive(pois.length); setResult(null)
        }} style={{
          padding: '9px 16px', borderRadius: '8px', border: `1px dashed ${L.line}`,
          background: L.card, color: L.inkBody, fontSize: '13.5px', fontWeight: 600, cursor: 'pointer',
        }}>Add a place</button>
      )}

      {/* ── save ── */}
      {canEdit && (
        <div style={{
          position: 'sticky', bottom: 0, marginTop: '16px', padding: '16px 20px',
          background: L.card, borderTop: `1px solid ${L.line}`, borderRadius: '12px 12px 0 0',
          boxShadow: '0 -4px 18px rgba(0,0,0,.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <button onClick={save} disabled={saving || !dirty || badCount > 0} style={{
              padding: '10px 20px', borderRadius: '9px', border: 'none',
              cursor: dirty && !badCount ? 'pointer' : 'default',
              background: dirty && !badCount ? L.ink : L.line,
              color: dirty && !badCount ? L.onInk : L.inkFaint, fontSize: '14px', fontWeight: 600,
            }}>{saving ? 'Saving…' : 'Save — this goes live'}</button>
            <span style={{ fontSize: '13px', color: badCount ? L.red : L.inkMuted }}>
              {badCount > 0
                ? `${badCount} place${badCount === 1 ? '' : 's'} not ready — nothing saves until every one is valid`
                : dirty ? `${pois.length} places` : 'Nothing changed yet'}
            </span>
          </div>

          {result && !result.ok && (
            <div style={{ marginTop: '10px', fontSize: '13px', color: L.red, lineHeight: 1.6 }}>
              {result.error}
              {result.issues?.map((x: any, n: number) => (
                <div key={n} style={{ color: L.inkBody }}>· {pois[x.index]?.name || `Place ${x.index + 1}`} — {x.field}: {x.problem}</div>
              ))}
            </div>
          )}
          {result?.ok && (
            <div style={{ marginTop: '10px', fontSize: '13px', color: L.green }}>
              Saved and live.
              {result.warnings?.map((w: any, n: number) => (
                <div key={n} style={{ color: L.amber }}>⚠ {w.name} — {w.problem}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
