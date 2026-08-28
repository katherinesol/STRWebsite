'use client'
import { useEffect, useRef, useState } from 'react'
import { L, F, microLabel, cardStyle } from '@/lib/design-tokens'

/*  Condition photos for a stay: walk the property, shoot, upload.
 *
 *  THE TIMESTAMP IS THE POINT. captured_at comes from File.lastModified - the
 *  moment the shutter fired - and never from the clock at upload. A photo taken
 *  in a basement with no signal and uploaded forty minutes later has to keep the
 *  moment it was taken, because the whole value of the record is "this is what
 *  the property looked like at this time". created_at records arrival separately;
 *  they are different facts and the table holds both.
 *
 *  HOLD-AND-RETRY, NOT A SERVICE WORKER. The obvious robust answer is IndexedDB
 *  plus Background Sync, and it is the wrong answer here: Background Sync does
 *  not exist on iOS Safari, which is the phone most likely to be doing this. It
 *  would be real infrastructure that misses the platform it was built for. So
 *  the File objects are held in state, uploaded one at a time, and a failure
 *  stays visible and retryable. The cost is that closing the tab loses what has
 *  not uploaded - which is why leaving with work outstanding asks first.
 *
 *  SILENCE ON FAILURE IS THE ONLY UNACCEPTABLE OUTCOME. Nothing is removed from
 *  the list until its database row exists. A photo that failed looks failed.
 *
 *  THREE STEPS PER FILE, because the upload does not pass through our API:
 *  ask for a signed URL, PUT the bytes straight to storage, then record the row.
 *  Streaming through the route is what broke the 9.8MB guide upload, and a
 *  walkthrough is twenty to forty photos of 3-5MB. */

type Item = {
  file: File
  id: string
  state: 'pending' | 'uploading' | 'done' | 'failed'
  error?: string
  rowId?: string
}
const TAGS = [
  ['before', 'Before', 'Pre-arrival condition'],
  ['after', 'After', 'Post-departure condition'],
  ['issue', 'Issue', 'Something found mid-stay'],
] as const

const fmt = (d: Date) => d.toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function Walkthrough({ bookingId, bookingKind, propertyId, onUploaded }: {
  bookingId: string; bookingKind: 'direct' | 'platform'; propertyId: string; onUploaded?: () => void
}) {
  const [items, setItems] = useState<Item[]>([])
  const [tag, setTag] = useState<'before' | 'after' | 'issue'>('before')
  const [running, setRunning] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const outstanding = items.filter(i => i.state !== 'done').length

  /*  A tab closed mid-walkthrough loses whatever has not landed. That is the
      accepted cost of not shipping a service worker, so it is said out loud
      rather than discovered. */
  useEffect(() => {
    if (!outstanding) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [outstanding])

  function add(files: FileList | null) {
    if (!files?.length) return
    setItems(prev => [...prev, ...Array.from(files).map(f => ({
      file: f, id: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
      state: 'pending' as const,
    }))])
    if (inputRef.current) inputRef.current.value = ''
  }

  async function uploadOne(it: Item): Promise<void> {
    const set = (patch: Partial<Item>) => setItems(prev => prev.map(x => x.id === it.id ? { ...x, ...patch } : x))
    set({ state: 'uploading', error: undefined })
    try {
      // 1. a signed URL — the path is built server-side, never by us
      const sigRes = await fetch('/api/admin/booking-media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, property_id: propertyId, filename: it.file.name, content_type: it.file.type }),
      })
      const sig = await sigRes.json()
      if (!sigRes.ok) throw new Error(sig.error || 'Could not start the upload')

      // 2. the bytes, straight to storage
      const put = await fetch(sig.signedUrl, {
        method: 'PUT', headers: { 'Content-Type': it.file.type || 'image/jpeg' }, body: it.file,
      })
      if (!put.ok) throw new Error(`Upload failed (${put.status})`)

      // 3. the row — captured_at from the FILE, not from now
      const recRes = await fetch('/api/admin/booking-media', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId, booking_kind: bookingKind, property_id: propertyId,
          storage_path: sig.path, content_type: it.file.type, tag,
          captured_at: new Date(it.file.lastModified).toISOString(),
        }),
      })
      const rec = await recRes.json()
      if (!recRes.ok) throw new Error(rec.error || 'Uploaded, but could not be recorded')

      set({ state: 'done', rowId: rec.media?.id })
    } catch (e: any) {
      set({ state: 'failed', error: e?.message || 'Failed' })
    }
  }

  /*  One at a time. A phone on one bar does better with a queue than with twenty
      simultaneous uploads, and sequential failures are legible. */
  async function run(only?: 'failed') {
    if (running) return
    setRunning(true)
    const queue = items.filter(i => only === 'failed' ? i.state === 'failed' : i.state === 'pending' || i.state === 'failed')
    for (const it of queue) await uploadOne(it)
    setRunning(false)
    onUploaded?.()
  }

  const counts = {
    pending: items.filter(i => i.state === 'pending').length,
    done: items.filter(i => i.state === 'done').length,
    failed: items.filter(i => i.state === 'failed').length,
  }

  return (
    <div style={{ ...cardStyle, padding: '18px 20px' }}>
      <div style={{ ...microLabel, marginBottom: '10px' }}>Condition photos</div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {TAGS.map(([v, label, hint]) => (
          <button key={v} onClick={() => setTag(v)} title={hint}
            style={{
              padding: '7px 12px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
              border: `1px solid ${tag === v ? L.ink : L.line}`,
              background: tag === v ? L.ink : 'transparent', color: tag === v ? L.card : L.inkFaint,
            }}>{label}</button>
        ))}
      </div>
      <div style={{ fontSize: '12px', color: L.inkFaint, marginBottom: '10px' }}>
        {TAGS.find(t => t[0] === tag)![2]} — each photo keeps the time it was taken, not the time it uploads.
      </div>

      <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple
        onChange={e => add(e.target.files)}
        style={{ display: 'block', width: '100%', fontSize: '13px', color: L.inkMuted, marginBottom: '10px' }} />

      {items.length > 0 && (
        <>
          <div style={{ display: 'grid', gap: '5px', marginBottom: '10px' }}>
            {items.map(it => {
              const colour = it.state === 'done' ? L.green : it.state === 'failed' ? L.red : L.inkFaint
              return (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' }}>
                  <span style={{ color: colour, width: '62px' }}>
                    {it.state === 'done' ? '✓ saved' : it.state === 'failed' ? '✗ failed' : it.state === 'uploading' ? '↑ …' : 'queued'}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, color: L.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.file.name}
                  </span>
                  <span style={{ color: L.inkFaint, fontFamily: F.mono, fontSize: '11.5px' }}>
                    {fmt(new Date(it.file.lastModified))}
                  </span>
                  {it.error && <span style={{ color: L.red, fontSize: '11.5px' }}>{it.error}</span>}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => run()} disabled={running || !counts.pending && !counts.failed}
              style={{ padding: '9px 14px', borderRadius: '8px', border: 'none', background: L.ink, color: L.card, fontSize: '13px', cursor: 'pointer', opacity: running ? 0.5 : 1 }}>
              {running ? 'Uploading…' : `Upload ${counts.pending + counts.failed} photo${counts.pending + counts.failed === 1 ? '' : 's'}`}
            </button>
            {counts.failed > 0 && !running && (
              <button onClick={() => run('failed')}
                style={{ padding: '9px 14px', borderRadius: '8px', border: `1px solid ${L.red}`, background: 'transparent', color: L.red, fontSize: '13px', cursor: 'pointer' }}>
                Retry {counts.failed} failed
              </button>
            )}
            {counts.done > 0 && (
              <button onClick={() => setItems(prev => prev.filter(i => i.state !== 'done'))}
                style={{ padding: '9px 14px', borderRadius: '8px', border: `1px solid ${L.line}`, background: 'transparent', color: L.inkFaint, fontSize: '13px', cursor: 'pointer' }}>
                Clear {counts.done} saved
              </button>
            )}
          </div>

          {outstanding > 0 && (
            <div style={{ fontSize: '12px', color: L.inkFaint, marginTop: '8px', lineHeight: 1.5 }}>
              {outstanding} photo{outstanding === 1 ? '' : 's'} not yet saved. They live only in this tab until they upload —
              leaving the page loses them.
            </div>
          )}
        </>
      )}
    </div>
  )
}
