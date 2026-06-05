'use client'
import dynamic from 'next/dynamic'
import { Property } from '@/lib/properties'

const NeighbourhoodMap = dynamic(
  () => import('./NeighbourhoodMap'),
  {
    ssr: false,
    loading: () => (
      <div style={{
        height: '400px', background: 'var(--linen)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '0.5px solid var(--sand)',
      }}>
        <span style={{
          fontSize: '10px', letterSpacing: '.12em',
          textTransform: 'uppercase', color: 'var(--muted)',
        }}>
          Loading map...
        </span>
      </div>
    ),
  }
)

export default function NeighbourhoodMapWrapper({ property }: { property: Property }) {
  return <NeighbourhoodMap property={property} />
}
