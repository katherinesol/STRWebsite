'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { L, microLabel, cardStyle } from '@/lib/design-tokens'

/*  Restyled onto the keyholder tokens, NOT rebuilt.
 *
 *  Every line of behaviour below is the one that has been uploading, tagging,
 *  reordering and deleting photos all along — same four API routes, same
 *  optimistic updates, same drag handling. What changed is the palette: this was
 *  written for the dark /admin chrome, and dropped into the light shell its own
 *  colours would have rendered pale text on white panels.
 *
 *  Restyled IN PLACE rather than forked because, once this commit lands, the
 *  legacy photos page redirects here and this component has exactly ONE caller.
 *  A second copy would be two things to fix the day an upload bug appears. */

const TAGS = ['exterior', 'living', 'bedroom', 'bathroom', 'kitchen', 'amenities', 'neighborhood', 'video']

type Photo = {
  id: string
  url: string
  storage_path: string
  media_type: string
  tag: string
  is_cover: boolean
  sort_order: number
}

export default function PhotoManager({ propertyId, initialPhotos }: { propertyId: string; initialPhotos: Photo[] }) {
  const router = useRouter()
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos)
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    setUploading({ done: 0, total: files.length })
    const uploaded: Photo[] = []
    for (let i = 0; i < files.length; i++) {
      const formData = new FormData()
      formData.append('file', files[i])
      formData.append('property_id', propertyId)
      try {
        const res = await fetch('/api/admin/photos', { method: 'POST', body: formData })
        const data = await res.json()
        if (data.photo) uploaded.push(data.photo)
      } catch {}
      setUploading({ done: i + 1, total: files.length })
    }
    setPhotos(p => [...p, ...uploaded])
    setUploading(null)
  }

  async function setTag(id: string, tag: string) {
    setPhotos(p => p.map(ph => ph.id === id ? { ...ph, tag } : ph))
    await fetch(`/api/admin/photos/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag }),
    })
  }

  async function setCover(id: string) {
    setPhotos(p => p.map(ph => ({ ...ph, is_cover: ph.id === id })))
    await fetch(`/api/admin/photos/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_cover: true }),
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this photo? This cannot be undone.')) return
    setPhotos(p => p.filter(ph => ph.id !== id))
    await fetch(`/api/admin/photos/${id}`, { method: 'DELETE' })
  }

  async function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return
    const ordered = [...photos]
    const from = ordered.findIndex(p => p.id === dragId)
    const to = ordered.findIndex(p => p.id === targetId)
    const [moved] = ordered.splice(from, 1)
    ordered.splice(to, 0, moved)
    setPhotos(ordered)
    setDragId(null)
    await fetch('/api/admin/photos', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: ordered.map(p => p.id) }),
    })
  }

  const visible = filter ? photos.filter(p => p.tag === filter) : photos

  return (
    <div>
      {/* upload zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
        style={{
          border: `1px dashed ${L.line}`, background: L.cardAlt, borderRadius: '12px',
          padding: '34px 16px', textAlign: 'center', cursor: 'pointer', marginBottom: '18px',
        }}>
        <input ref={fileRef} type="file" multiple accept="image/*,video/mp4" style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)} />
        {uploading ? (
          <div style={{ fontSize: '14px', color: L.amber, fontWeight: 600 }}>Uploading {uploading.done} of {uploading.total}…</div>
        ) : (
          <div style={{ fontSize: '14px', color: L.inkBody }}>
            Drop photos here, or click to choose them<br />
            <span style={{ fontSize: '12.5px', color: L.inkFaint }}>JPG, PNG, WEBP or MP4 · as many at once as you like</span>
          </div>
        )}
      </div>

      {/* tag filter */}
      <div className="filter-chips" style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button onClick={() => setFilter('')}
          style={{ ...microLabel, padding: '7px 13px', borderRadius: '999px', cursor: 'pointer', border: `1px solid ${!filter ? L.ink : L.line}`, background: !filter ? L.ink : L.card, color: !filter ? L.onInk : L.inkMuted }}>
          All ({photos.length})
        </button>
        {TAGS.map(t => {
          const count = photos.filter(p => p.tag === t).length
          if (!count) return null
          return (
            <button key={t} onClick={() => setFilter(t)}
              style={{ ...microLabel, padding: '7px 13px', borderRadius: '999px', cursor: 'pointer', border: `1px solid ${filter === t ? L.ink : L.line}`, background: filter === t ? L.ink : L.card, color: filter === t ? L.onInk : L.inkMuted }}>
              {t} ({count})
            </button>
          )
        })}
      </div>

      {/* grid */}
      {!visible.length ? (
        <div style={{ ...cardStyle, padding: '48px 20px', textAlign: 'center', fontSize: '14px', color: L.inkMuted }}>
          No photos here yet. The guest gallery is empty until you add some.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
          {visible.map(p => (
            <div key={p.id}
              draggable={!filter}
              onDragStart={() => setDragId(p.id)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(p.id)}
              style={{
                background: L.card, borderRadius: '10px', overflow: 'hidden',
                border: p.is_cover ? `2px solid ${L.ink}` : `1px solid ${L.line}`,
                opacity: dragId === p.id ? .4 : 1, cursor: filter ? 'default' : 'grab',
              }}>
              <div style={{ aspectRatio: '4/3', overflow: 'hidden', background: L.cardAlt, position: 'relative' }}>
                {p.media_type === 'video' ? (
                  <>
                    <video src={p.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline preload="metadata" />
                    <span style={{ position: 'absolute', top: '6px', left: '6px', fontSize: '9px', padding: '2px 6px', background: 'rgba(0,0,0,.62)', color: '#fff', letterSpacing: '.08em', textTransform: 'uppercase', borderRadius: '4px' }}>▶ Video</span>
                  </>
                ) : (
                  <img src={p.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                {p.is_cover && (
                  <span style={{ position: 'absolute', top: '6px', right: '6px', fontSize: '9px', padding: '2px 6px', background: L.ink, color: L.onInk, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600, borderRadius: '4px' }}>Cover</span>
                )}
              </div>
              <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <select value={p.tag} onChange={e => setTag(p.id, e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', background: L.card, border: `1px solid ${L.line}`, color: L.inkBody, fontFamily: 'inherit', fontSize: '12.5px', outline: 'none' }}>
                  {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {!p.is_cover && p.media_type === 'image' && (
                    <button onClick={() => setCover(p.id)}
                      style={{ flex: 1, padding: '6px', borderRadius: '6px', background: L.card, border: `1px solid ${L.line}`, color: L.inkBody, fontFamily: 'inherit', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                      Set as cover
                    </button>
                  )}
                  <button onClick={() => handleDelete(p.id)}
                    style={{ padding: '6px 11px', borderRadius: '6px', background: L.redWash, border: `1px solid ${L.redLine}`, color: L.red, fontFamily: 'inherit', fontSize: '12px', cursor: 'pointer' }}>
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {!filter && photos.length > 1 && (
        <div style={{ fontSize: '12.5px', color: L.inkMuted, marginTop: '14px' }}>Drag to reorder. The first photo is the one guests see first.</div>
      )}
    </div>
  )
}
