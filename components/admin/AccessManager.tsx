'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Lock = { id: string; name: string; device_id: string }
type Code = { id: string; code: string; notes: string | null }

export default function AccessManager({
  bookingId, propertyId, locks, existingCodes, bookingRef,
}: {
  bookingId: string
  propertyId: string
  locks: Lock[]
  existingCodes: Code[]
  bookingRef: string
}) {
  const router = useRouter()
  const [codes, setCodes] = useState<Record<string, string>>(
    Object.fromEntries(locks.map(l => [l.id, bookingRef]))
  )
  const [generating, setGenerating] = useState(false)
  const [schlagePrompt, setSchlagePrompt] = useState(false)

  async function generateCodes() {
    setGenerating(true)
    try {
      const entries = locks.map(l => ({
        booking_id: bookingId,
        property_id: propertyId,
        code: codes[l.id] || bookingRef,
        notes: l.name,
      }))
      await fetch('/api/admin/access/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: entries }),
      })
      setSchlagePrompt(true)
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
      {schlagePrompt && (
        <div style={{ marginTop: '12px', padding: '14px 16px', background: '#2a1f0a', border: '0.5px solid #4a3a1a' }}>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: '#f39c12', marginBottom: '6px' }}>
            ⚠ Action required — Schlage app
          </div>
          <div style={{ fontSize: '13px', color: '#F5F2EC', lineHeight: 1.6 }}>
            Enter code <strong style={{ fontFamily: 'monospace', fontSize: '16px', letterSpacing: '.14em', color: '#f39c12' }}>{bookingRef}</strong> in the Schlage Home app for all {locks.length} lock{locks.length !== 1 ? 's' : ''} at this property.
          </div>
          <button
            onClick={() => setSchlagePrompt(false)}
            style={{ marginTop: '10px', padding: '6px 14px', background: 'transparent', border: '0.5px solid #f39c12', color: '#f39c12', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            Done ✓
          </button>
        </div>
      )}
    </div>
  )
}
