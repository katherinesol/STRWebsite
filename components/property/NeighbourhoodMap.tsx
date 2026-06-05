'use client'
import { useState } from 'react'
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox'
import type { CircleLayer } from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Property, POI } from '@/lib/properties'

const CATEGORY_COLORS: Record<string, string> = {
  restaurant:  '#B8956B',
  cafe:        '#8B6B4A',
  transit:     '#3D6ECC',
  grocery:     '#2ECC71',
  beach:       '#06AED5',
  park:        '#4CAF50',
  attraction:  '#9B59B6',
  pharmacy:    '#E74C3C',
}

const CATEGORY_LABELS: Record<string, string> = {
  restaurant:  'Restaurant',
  cafe:        'Café',
  transit:     'Transit',
  grocery:     'Grocery',
  beach:       'Beach',
  park:        'Park',
  attraction:  'Attraction',
  pharmacy:    'Pharmacy',
}

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
  const pois = property.pois || []
  const categories = [...new Set(pois.map(p => p.category))]

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
    geometry: { type: 'Point' as const, coordinates: [property.mapOffset.lng, property.mapOffset.lat] },
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
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: CATEGORY_COLORS[cat], flexShrink: 0, display: 'block' }} />
            <span style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{CATEGORY_LABELS[cat]}</span>
          </div>
        ))}
      </div>

      {/* map */}
      <div style={{ position: 'relative', height: '420px' }}>
        <Map
          mapboxAccessToken={token}
          initialViewState={{ longitude: property.mapOffset.lng, latitude: property.mapOffset.lat, zoom: 14 }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/light-v11"
          scrollZoom={false}
        >
          {/* area circle */}
          <Source id="area" type="geojson" data={areaGeoJSON}>
            <Layer {...circleLayer} />
          </Source>

          {/* offset property pin */}
          <Marker longitude={property.mapOffset.lng} latitude={property.mapOffset.lat}>
            <div style={{
              width: '14px', height: '14px', borderRadius: '50%',
              background: '#1A1A18', border: '3px solid #FAFAF8',
              boxShadow: '0 2px 8px rgba(0,0,0,.3)',
            }} />
          </Marker>

          {/* POI markers */}
          {pois.map(poi => (
            <Marker key={poi.id} longitude={poi.lng} latitude={poi.lat} onClick={() => setSelectedPOI(poi)}>
              <div style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: CATEGORY_COLORS[poi.category] || '#888880',
                border: '2px solid #FAFAF8',
                boxShadow: '0 1px 4px rgba(0,0,0,.25)',
                cursor: 'pointer',
              }} />
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
    </div>
  )
}
