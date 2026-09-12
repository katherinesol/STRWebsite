'use client'
import { useState } from 'react'
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox'
import type { CircleLayer } from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Property, POI } from '@/lib/properties'
import { categoryColour, categoryLabel, categoryPath } from '@/lib/poi-categories'

/*  Colours and labels used to live here in two copies. They now come from
 *  lib/poi-categories, which the Places editor reads as well — so the pin
 *  Katherine drags is the pin the guest sees, and a ninth category is added
 *  once rather than three times. */
const CATEGORY_COLORS = new Proxy({}, { get: (_, k: string) => categoryColour(k) }) as Record<string, string>
const CATEGORY_LABELS = new Proxy({}, { get: (_, k: string) => categoryLabel(k) }) as Record<string, string>

/*  An icon reads at pin size where a coloured dot needs a legend — and colour
 *  alone excludes anyone who cannot separate these eight hues. */
const PinIcon = ({ category, size = 22 }: { category: string; size?: number }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center',
    background: categoryColour(category), border: '2px solid #FAFAF8',
    boxShadow: '0 1px 4px rgba(0,0,0,.25)', cursor: 'pointer',
  }}>
    <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none"
      stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={categoryPath(category)} />
    </svg>
  </div>
)

function TravelBadge({ label, mins }: { label: string; mins: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '4px 10px', background: 'var(--linen)',
      border: '0.5px solid var(--sand)',
    }}>
      <span style={{ fontSize: '10px', color: 'var(--muted)', letterSpacing: '.06em' }}>{label}</span>
      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--noir)' }}>{mins} min</span>
    </div>
  )
}

const circleLayer: CircleLayer = {
  id: 'area-circle',
  type: 'circle',
  source: 'area',
  paint: {
    'circle-radius': { stops: [[12, 60], [14, 120], [16, 240]] },
    'circle-color': '#1A1A18',
    'circle-opacity': 0.08,
    'circle-stroke-width': 1,
    'circle-stroke-color': '#1A1A18',
    'circle-stroke-opacity': 0.15,
  },
}

export default function NeighbourhoodMap({ property }: { property: Property }) {
  const [selectedPOI, setSelectedPOI] = useState<POI | null>(null)
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim()
  /*  A POI WITHOUT USABLE COORDINATES IS SKIPPED, NOT RENDERED.
   *
   *  <Marker longitude={undefined}> does not degrade — it throws, and takes the
   *  whole map with it. That never mattered while these came from a hand-written
   *  TypeScript file where every entry was complete. They now come from a jsonb
   *  column that a person edits, and the field-level fallback cannot help: `pois`
   *  is one field, so an array with five good entries and one malformed one is a
   *  perfectly valid non-null value and passes straight through.
   *
   *  So the bad entry is dropped and the other five still draw. The text list
   *  below is built from the same filtered array, so map and list cannot
   *  disagree about what is nearby. */
  const usable = (p: any) => Number.isFinite(Number(p?.lat)) && Number.isFinite(Number(p?.lng))
  const pois = (property.pois || []).filter(usable)
  const categories = [...new Set(pois.map(p => p.category))]

  /*  The map centre, which was read straight off property.mapOffset in three
   *  places with no guard. A null there is now a missing map rather than a
   *  TypeError that blanks the section — and it falls back to the mean of the
   *  POIs before giving up, because a map centred near the right places beats no
   *  map on the page selling the property. */
  const centre = property.mapOffset
    ?? (pois.length
        ? { lat: pois.reduce((t, p) => t + Number(p.lat), 0) / pois.length,
            lng: pois.reduce((t, p) => t + Number(p.lng), 0) / pois.length }
        : null)

  if (!token || token === 'your_token_here' || !property.mapOffset) {
    return (
      <div style={{ borderTop: '0.5px solid var(--sand)', paddingTop: '40px', marginBottom: '48px' }}>
        <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '8px' }}>The neighbourhood</div>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: 'var(--noir)', marginBottom: '24px' }}>What&apos;s nearby.</h2>
        <div style={{ height: '400px', background: 'var(--linen)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '0.5px solid var(--sand)' }}>
          <span style={{ fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Map unavailable — add Mapbox token</span>
        </div>
      </div>
    )
  }

  const areaGeoJSON = {
    type: 'Feature' as const,
    //  centre is null-checked before the map renders; this object is only ever
    //  consumed inside that guard, so the fallback pair is never drawn.
    geometry: { type: 'Point' as const, coordinates: [centre?.lng ?? 0, centre?.lat ?? 0] },
    properties: {},
  }

  return (
    <div style={{ borderTop: '0.5px solid var(--sand)', paddingTop: '40px', marginBottom: '48px' }}>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '8px' }}>The neighbourhood</div>
      <h2 style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: 'var(--noir)', marginBottom: '8px' }}>What&apos;s nearby.</h2>
      <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '24px', lineHeight: 1.6 }}>Pin shows approximate location. Distances are accurate.</p>

      {/* legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        {categories.map(cat => (
          <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'var(--linen)', border: '0.5px solid var(--sand)' }}>
            <PinIcon category={cat} size={16} />
            <span style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{CATEGORY_LABELS[cat]}</span>
          </div>
        ))}
      </div>

      {/* map */}
      {!centre ? null : (
      <div style={{ position: 'relative', height: '420px' }}>
        <Map
          mapboxAccessToken={token}
          initialViewState={{ longitude: centre.lng, latitude: centre.lat, zoom: 14 }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/light-v11"
          scrollZoom={false}
        >
          {/* area circle */}
          <Source id="area" type="geojson" data={areaGeoJSON}>
            <Layer {...circleLayer} />
          </Source>

          {/* offset property pin */}
          <Marker longitude={centre.lng} latitude={centre.lat}>
            <div style={{
              width: '14px', height: '14px', borderRadius: '50%',
              background: '#1A1A18', border: '3px solid #FAFAF8',
              boxShadow: '0 2px 8px rgba(0,0,0,.3)',
            }} />
          </Marker>

          {/* POI markers */}
          {pois.map(poi => (
            <Marker key={poi.id} longitude={poi.lng} latitude={poi.lat} onClick={() => setSelectedPOI(poi)}>
              <PinIcon category={poi.category} />
            </Marker>
          ))}
        </Map>

        {/* POI card */}
        {selectedPOI && (
          <div style={{
            position: 'absolute', bottom: '16px', left: '16px',
            background: 'rgba(250,250,248,.96)', border: '0.5px solid var(--sand)',
            padding: '16px 18px', backdropFilter: 'blur(8px)',
            minWidth: '240px', maxWidth: '320px', zIndex: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: CATEGORY_COLORS[selectedPOI.category], marginBottom: '4px' }}>
                  {CATEGORY_LABELS[selectedPOI.category]}
                </div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: '17px', fontWeight: 300, color: 'var(--noir)', marginBottom: '10px' }}>
                  {selectedPOI.name}
                </div>
              </div>
              <button onClick={() => setSelectedPOI(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted)', padding: '0 0 0 12px' }}>×</button>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {selectedPOI.walkMins && <TravelBadge label="Walk" mins={selectedPOI.walkMins} />}
              {selectedPOI.transitMins && <TravelBadge label="Transit" mins={selectedPOI.transitMins} />}
              {selectedPOI.driveMins && <TravelBadge label="Drive" mins={selectedPOI.driveMins} />}
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
