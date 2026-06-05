'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Lock = { id: string; name: string; device_id: string }
type Code = { id: string; code: string; notes: string | null }

export default function AccessManager({
  bookingId, propertyId, locks, existingCodes,
}: {
  bookingId: string
  propertyId: string
  locks: Lock[]
  existingCodes: Code[]
}) {
  const router = useRouter()
  const [codes, setCodes] = useState<Record<string, string>>(
    Object.fromEntries(locks.map(l => [l.id, '']))
  )
  const [generating, setGenerating] = useState(false)

  async function generateCodes() {
    setGenerating(true)
    try {
      const entries = locks.map(l => ({
        booking_id: bookingId,
        property_id: propertyId,
        code: codes[l.id] || Math.floor(100000 + Math.random() * 900000).toString(),
        notes: l.name,
      }))
      await fetch('/api/admin/access/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: entries }),
      })
      router.refresh()
    } catch {}
    finally { setGenerating(false) }
  }

  if (locks.length === 0) {
    return (
      <div style={{ fontSize: '12px', color: '#666660' }}>
        No locks configured for this property.
        <a href={`/admin/properties/${propertyId}`} style={{ color: 'var(--amber)', marginLeft: '6px', textDecoration: 'none' }}>
          Add locks →
        </a>
      </div>
    )
  }

  return (
    <div>
      {existingCodes.length > 0 ? (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '8px' }}>Current codes</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {existingCodes.map(c => (
              <div key={c.id} style={{ background: '#1E1E1C', border: '0.5px solid #363634', padding: '8px 14px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '.08em', textTransform: 'uppercase', color: '#666660', marginBottom: '3px' }}>{c.notes}</div>
                <div style={{ fontFamily: 'monospace', fontSize: '20px', color: 'var(--amber)', letterSpacing: '.14em' }}>{c.code}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '10px' }}>
            Set codes for {locks.length} lock{locks.length !== 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {locks.map(lock => (
              <div key={lock.id}>
                <div style={{ fontSize: '10px', letterSpacing: '.08em', textTransform: 'uppercase', color: '#666660', marginBottom: '4px' }}>{lock.name}</div>
                <input
                  type="text"
                  value={codes[lock.id]}
                  onChange={e => setCodes(c => ({ ...c, [lock.id]: e.target.value }))}
                  placeholder="Auto-generate"
                  maxLength={8}
                  style={{
                    width: '120px', padding: '8px 10px',
                    background: '#363634', border: '0.5px solid #4A4A48',
                    color: '#F5F2EC', fontFamily: 'monospace', fontSize: '16px',
                    letterSpacing: '.12em', outline: 'none',
                  }}
                />
              </div>
            ))}
          </div>
          <button
            onClick={generateCodes}
            disabled={generating}
            style={{
              padding: '8px 20px', background: generating ? '#363634' : 'var(--amber)',
              color: generating ? '#666660' : '#1A1A18', border: 'none',
              fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em',
              textTransform: 'uppercase', cursor: generating ? 'not-allowed' : 'pointer', fontWeight: 500,
            }}
          >
            {generating ? 'Saving...' : 'Save codes'}
          </button>
        </div>
      )}
    </div>
  )
}
