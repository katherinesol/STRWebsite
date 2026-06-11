'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function GuestLinkSearch({ blockId, bookingId }: { blockId?: string; bookingId?: string }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [linking, setLinking] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  async function handleSearch(q: string) {
    setQuery(q)
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/admin/guests/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.guests || [])
    } catch {}
    finally { setSearching(false) }
  }

  async function handleLink(guestId: string, guestName: string) {
    setLinking(true)
    try {
      if (blockId) {
        await fetch(`/api/admin/calendar/block/${blockId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guest_id: guestId, guest_name: guestName }),
        })
      } else if (bookingId) {
        await fetch(`/api/admin/bookings/${bookingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guest_id: guestId }),
        })
      }
      router.refresh()
    } catch {}
    finally { setLinking(false) }
  }

  async function handleCreate() {
    if (!query.trim()) return
    setLinking(true)
    try {
      const res = await fetch('/api/admin/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: query.trim() }),
      })
      const data = await res.json()
      if (data.guest) {
        await handleLink(data.guest.id, data.guest.name)
      }
    } catch {}
    finally { setLinking(false) }
  }

  return (
    <div>
      <div style={{ fontSize: '13px', color: '#666660', marginBottom: '10px' }}>No guest linked to this booking.</div>
      <input
        type="text"
        value={query}
        onChange={e => handleSearch(e.target.value)}
        placeholder="Search guest by name to link..."
        style={{ width: '100%', padding: '9px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none', borderRadius: '2px', boxSizing: 'border-box' }}
      />
      {searching && <div style={{ fontSize: '11px', color: '#666660', marginTop: '6px' }}>Searching...</div>}
      {results.length > 0 && (
        <div style={{ background: '#1E1E1C', border: '0.5px solid #363634', marginTop: '6px' }}>
          {results.map(g => (
            <button key={g.id} onClick={() => handleLink(g.id, g.name)} disabled={linking}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '0.5px solid #2A2A28', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px', cursor: 'pointer' }}>
              {g.name} {g.email && <span style={{ color: '#666660', fontSize: '11px' }}>· {g.email}</span>}
            </button>
          ))}
        </div>
      )}
      {query.length >= 2 && !searching && results.length === 0 && (
        <button onClick={handleCreate} disabled={linking}
          style={{ marginTop: '8px', padding: '8px 16px', background: 'var(--amber)', color: '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', fontWeight: 500, letterSpacing: '.08em', textTransform: 'uppercase' }}>
          {linking ? 'Creating...' : `+ Create "${query}" and link`}
        </button>
      )}
    </div>
  )
}
