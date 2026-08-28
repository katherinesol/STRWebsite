'use client'
import { useCallback, useEffect, useState } from 'react'
import { L, F, microLabel, cardStyle } from '@/lib/design-tokens'
import Walkthrough from './Walkthrough'

/*  What was photographed, grouped by when in the stay it was taken.
 *
 *  EVERY PHOTO SHOWS ITS captured_at, not its upload time. On a record whose
 *  purpose is "this is what the property looked like then", displaying the
 *  arrival time would quietly answer a different question.
 *
 *  DELETE IS OWNER AND CO-OWNER ONLY while upload admits cleaners, and the
 *  asymmetry is the point rather than an oversight: a cleaner should be able to
 *  add evidence and should not be able to remove it. The endpoint enforces this;
 *  the button is hidden to match, so nobody is offered an action that 403s.
 *
 *  Read URLs are signed and expire in an hour, so the list refetches rather
 *  than caching them. */

type Media = {
  id: string; url: string | null; tag: string; media_type: string
  captured_at: string | null; created_at: string; added_by: string | null
}
const GROUPS = [
  ['before', 'Before', 'Pre-arrival'],
  ['after', 'After', 'Post-departure'],
  ['issue', 'Issue', 'Found during the stay'],
] as const

const when = (m: Media) => {
  const t = m.captured_at || m.created_at
  return new Date(t).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function WalkthroughGallery({ bookingId, bookingKind, propertyId, canDelete }: {
  bookingId: string; bookingKind: 'direct' | 'platform'; propertyId: string; canDelete: boolean
}) {
  const [media, setMedia] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/booking-media?booking_id=${bookingId}`)
      const j = await res.json()
      if (!res.ok) { setErr(j.error || 'Could not load photos'); return }
      setMedia(j.media || []); setErr('')
    } catch { setErr('Could not load photos') } finally { setLoading(false) }
  }, [bookingId])

  useEffect(() => { load() }, [load])

  async function remove(id: string) {
    if (!confirm('Delete this photo? It is part of the condition record for this stay.')) return
    const res = await fetch(`/api/admin/booking-media?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || 'Could not delete'); return }
    load()
  }

  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <Walkthrough bookingId={bookingId} bookingKind={bookingKind} propertyId={propertyId} onUploaded={load} />

      {!loading && media.length > 0 && (
        <div style={{ ...cardStyle, padding: '18px 20px' }}>
          <div style={{ ...microLabel, marginBottom: '4px' }}>
            Walkthrough · {media.length} item{media.length === 1 ? '' : 's'}
          </div>
          {GROUPS.map(([key, label, hint]) => {
            const rows = media.filter(m => m.tag === key)
            if (!rows.length) return null
            return (
              <div key={key} style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '12.5px', color: L.ink, marginBottom: '2px' }}>
                  {label} <span style={{ color: L.inkFaint }}>· {hint} · {rows.length}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))', gap: '8px', marginTop: '8px' }}>
                  {rows.map(m => (
                    <figure key={m.id} style={{ margin: 0 }}>
                      <div style={{ position: 'relative', aspectRatio: '1', borderRadius: '10px', overflow: 'hidden', border: `1px solid ${L.line}`, background: L.cardAlt }}>
                        {m.url
                          ? (m.media_type === 'video'
                            ? <video src={m.url} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <a href={m.url} target="_blank" rel="noreferrer">
                                <img src={m.url} alt={`${label} · ${when(m)}`} loading="lazy"
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              </a>)
                          : <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: '11px', color: L.inkFaint }}>no preview</div>}
                        {canDelete && (
                          <button onClick={() => remove(m.id)} title="Delete"
                            style={{ position: 'absolute', top: '4px', right: '4px', width: '22px', height: '22px', borderRadius: '6px', border: 'none', background: 'oklch(0.25 0.01 60 / 0.55)', color: '#fff', fontSize: '12px', cursor: 'pointer', lineHeight: 1 }}>×</button>
                        )}
                      </div>
                      <figcaption style={{ fontSize: '11px', color: L.inkFaint, marginTop: '4px', fontFamily: F.mono }}>
                        {when(m)}{m.captured_at ? '' : ' (uploaded)'}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            )
          })}
          <div style={{ fontSize: '11.5px', color: L.inkFaint, marginTop: '12px', lineHeight: 1.5 }}>
            Times shown are when each photo was taken.
            {!canDelete && ' Removing a photo is an owner action.'}
          </div>
        </div>
      )}
      {err && <div style={{ fontSize: '12.5px', color: L.red }}>{err}</div>}
    </div>
  )
}
