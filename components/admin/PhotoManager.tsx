'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

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
          border: '1px dashed #4A4A48', background: '#1E1E1C',
          padding: '28px 16px', textAlign: 'center', cursor: 'pointer', marginBottom: '16px',
        }}>
        <input ref={fileRef} type="file" multiple accept="image/*,video/mp4" style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)} />
        {uploading ? (
          <div style={{ fontSize: '13px', color: 'var(--amber)' }}>Uploading {uploading.done}/{uploading.total}...</div>
        ) : (
          <div style={{ fontSize: '13px', color: '#9A9A92' }}>
            Tap to select or drag photos/videos here<br />
            <span style={{ fontSize: '11px', color: '#666660' }}>JPG, PNG, WEBP, MP4 · multiple at once</span>
          </div>
        )}
      </div>

      {/* tag filter */}
      <div className="filter-chips" style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button onClick={() => setFilter('')}
          style={{ padding: '6px 12px', fontSize: '10px', letterSpacing: '.08em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)', background: !filter ? '#F5F2EC' : '#363634', color: !filter ? '#1A1A18' : '#9A9A92' }}>
          All ({photos.length})
        </button>
        {TAGS.map(t => {
          const count = photos.filter(p => p.tag === t).length
          if (!count) return null
          return (
            <button key={t} onClick={() => setFilter(t)}
              style={{ padding: '6px 12px', fontSize: '10px', letterSpacing: '.08em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)', background: filter === t ? 'var(--amber)' : '#363634', color: filter === t ? '#1A1A18' : '#9A9A92' }}>
              {t} ({count})
            </button>
          )
        })}
      </div>

      {/* grid */}
      {!visible.length ? (
        <div style={{ padding: '40px', textAlign: 'center', fontSize: '13px', color: '#666660' }}>No media yet</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
          {visible.map(p => (
            <div key={p.id}
              draggable={!filter}
              onDragStart={() => setDragId(p.id)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(p.id)}
              style={{
                background: '#242422', border: p.is_cover ? '1.5px solid var(--amber)' : '0.5px solid #363634',
                opacity: dragId === p.id ? .4 : 1, cursor: filter ? 'default' : 'grab',
              }}>
              <div style={{ aspectRatio: '4/3', overflow: 'hidden', background: '#1A1A18', position: 'relative' }}>
                {p.media_type === 'video' ? (
                  <>
                    <video src={p.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline preload="metadata" />
                    <span style={{ position: 'absolute', top: '6px', left: '6px', fontSize: '9px', padding: '2px 6px', background: 'rgba(0,0,0,.7)', color: '#F5F2EC', letterSpacing: '.08em', textTransform: 'uppercase' }}>▶ Video</span>
                  </>
                ) : (
                  <img src={p.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
                {p.is_cover && (
                  <span style={{ position: 'absolute', top: '6px', right: '6px', fontSize: '9px', padding: '2px 6px', background: 'var(--amber)', color: '#1A1A18', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500 }}>Cover</span>
                )}
              </div>
              <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <select value={p.tag} onChange={e => setTag(p.id, e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', background: '#363634', border: 'none', color: '#AEAEA6', fontFamily: 'var(--sans)', fontSize: '11px', outline: 'none' }}>
                  {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {!p.is_cover && p.media_type === 'image' && (
                    <button onClick={() => setCover(p.id)}
                      style={{ flex: 1, padding: '5px', background: '#363634', border: 'none', color: '#9A9A92', fontFamily: 'var(--sans)', fontSize: '10px', cursor: 'pointer', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                      Set cover
                    </button>
                  )}
                  <button onClick={() => handleDelete(p.id)}
                    style={{ padding: '5px 10px', background: '#2a1518', border: 'none', color: '#e74c3c', fontFamily: 'var(--sans)', fontSize: '10px', cursor: 'pointer' }}>
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {!filter && photos.length > 1 && (
        <div style={{ fontSize: '11px', color: '#666660', marginTop: '12px' }}>Drag photos to reorder. First photo shows first in the guest gallery.</div>
      )}
    </div>
  )
}
