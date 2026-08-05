'use client'
import { useState, useEffect, useRef } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
}

const PROPS = [
  { id: 'royal-york-east', name: 'Royal York East' },
  { id: 'royal-york-west', name: 'Royal York West' },
  { id: 'royal-york-both', name: 'Royal York' },
  { id: 'nickel-beach', name: 'Nickel Beach' },
]

type Draft = {
  id?: string
  vendor?: string; amount?: any; hst_paid?: any; date?: string
  category?: string; description?: string; property_id?: string
  notes?: string; line_items?: any[]; receipt_path?: string | null
  _status?: 'extracting' | 'ready' | 'saving' | 'error'
  _error?: string
  _dup?: string | null
  _dupOk?: boolean
}

export default function ReceiptQueue({ categories, onAllSaved }: { categories: string[]; onAllSaved?: () => void }) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  // load any saved drafts on mount — survives refresh
  useEffect(() => {
    fetch('/api/admin/expense-drafts').then(r => r.json()).then(d => {
      setDrafts((d.drafts || []).map((x: any) => ({ ...x, _status: 'ready' })))
    }).finally(() => setLoading(false))
  }, [])

  async function persist(draft: Draft): Promise<string | undefined> {
    const res = await fetch('/api/admin/expense-drafts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
    })
    const d = await res.json()
    return d.id
  }

  // edit a card; save the change to its draft
  async function edit(idx: number, patch: Partial<Draft>) {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, ...patch } : d))
    const current = { ...drafts[idx], ...patch }
    const id = await persist(current)
    if (id && !current.id) setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, id } : d))
  }

  async function remove(idx: number) {
    const d = drafts[idx]
    if (d.id) await fetch('/api/admin/expense-drafts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id }) })
    setDrafts(prev => prev.filter((_, i) => i !== idx))
  }

  function assignAll(property_id: string) {
    drafts.forEach((_, i) => edit(i, { property_id }))
  }

  async function saveAll() {
    setBusy(true)
    const remaining: Draft[] = []
    for (const d of drafts) {
      if (d._status === 'extracting') { remaining.push(d); continue }
      if (!d.description || !d.amount) { remaining.push({ ...d, _status: 'error', _error: 'Needs description and amount' }); continue }
      if (d._dup && !d._dupOk) { remaining.push({ ...d, _status: 'error', _error: 'Possible duplicate — confirm on the card to save' }); continue }
      try {
        const res = await fetch('/api/admin/expenses', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendor: d.vendor || null, amount: parseFloat(String(d.amount)) || 0,
            hst_paid: d.hst_paid ? parseFloat(String(d.hst_paid)) : null,
            date: d.date || null, category: d.category || categories[0],
            description: d.description, property_id: d.property_id || null,
            notes: d.notes || null, line_items: d.line_items || null,
            receipt_path: d.receipt_path || null, ai_extracted: true, confirmed: true, force: true, // user already reviewed dupes in-queue
          }),
        })
        if (!res.ok) { remaining.push({ ...d, _status: 'error', _error: 'Save failed' }); continue }
        if (d.id) await fetch('/api/admin/expense-drafts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.id }) })
      } catch {
        remaining.push({ ...d, _status: 'error', _error: 'Save failed' })
      }
    }
    setDrafts(remaining)
    setBusy(false)
    if (remaining.length === 0 && onAllSaved) onAllSaved()
  }

  // turn one image File into a draft via the extractor
  async function extractOne(file: File) {
    const placeholder: Draft = { _status: 'extracting', description: file.name }
    setDrafts(prev => [...prev, placeholder])
    const myIndex = drafts.length  // approximate; we reconcile by object identity below
    try {
      const fd = new FormData()
      fd.append('receipt', file)
      const res = await fetch('/api/admin/expenses/extract', { method: 'POST', body: fd })
      const data = await res.json()
      const draft: Draft = data.extracted ? {
        vendor: data.vendor || '', amount: data.amount || '', hst_paid: data.hst || '',
        date: data.date || new Date().toISOString().split('T')[0], category: data.category || categories[0],
        description: data.description || '', line_items: data.items || [],
        receipt_path: data.receipt_path || null, _status: 'ready',
      } : { ...placeholder, _status: 'error', _error: data.error || 'Could not read receipt' }
      let dupMsg: string | null = null
      if (draft._status === 'ready' && draft.amount && draft.date) {
        try {
          const dr = await fetch('/api/admin/expenses/check-dup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vendor: draft.vendor, amount: parseFloat(String(draft.amount)) || 0, date: draft.date }) })
          const dd = await dr.json()
          dupMsg = dd.message || null
        } catch {}
      }
      const id = draft._status === 'ready' ? await persist(draft) : undefined
      setDrafts(prev => {
        const copy = [...prev]
        const slot = copy.findIndex(x => x === placeholder)
        if (slot >= 0) copy[slot] = { ...draft, id, _dup: dupMsg }
        return copy
      })
    } catch {
      setDrafts(prev => prev.map(x => x === placeholder ? { ...x, _status: 'error', _error: 'Extraction failed' } : x))
    }
  }

  // split a PDF into page images, extract each
  async function handlePdf(file: File) {
    const buf = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width; canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport, canvas }).promise
      const blob: Blob = await new Promise(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.85))
      await extractOne(new File([blob], `${file.name}-p${n}.jpg`, { type: 'image/jpeg' }))
    }
  }

  async function intake(files: FileList | File[]) {
    setBusy(true)
    for (const f of Array.from(files)) {
      if (f.type === 'application/pdf') await handlePdf(f)
      else if (f.type.startsWith('image/')) await extractOne(f)
    }
    setBusy(false)
  }

  function onPaste(e: React.ClipboardEvent) {
    const imgs = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()!).filter(Boolean)
    if (imgs.length) { e.preventDefault(); intake(imgs) }
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer.files.length) intake(e.dataTransfer.files)
  }

  if (loading) return <div style={{ fontSize: '13px', color: '#666660' }}>Loading queue…</div>

  return (
    <div>
      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--amber)', marginBottom: '10px' }}>
        Receipt queue {drafts.length > 0 && `· ${drafts.length}`}
      </div>

      <div onDrop={onDrop} onDragOver={e => e.preventDefault()} onPaste={onPaste} tabIndex={0}
        style={{ border: '1px dashed #4A4A48', borderRadius: '8px', padding: '20px', textAlign: 'center', marginBottom: '14px', cursor: 'pointer', outline: 'none' }}
        onClick={() => fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.length) intake(e.target.files); e.target.value = '' }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.length) intake(e.target.files); e.target.value = '' }} />
        <div style={{ fontSize: '13px', color: '#AEAEA6' }}>{busy ? 'Reading…' : 'Drop receipts, paste a screenshot, or tap to choose'}</div>
        <div style={{ fontSize: '11px', color: '#666660', marginTop: '4px' }}>Images or PDFs — a multi-page PDF splits into one card per page</div>
        <button onClick={e => { e.stopPropagation(); cameraRef.current?.click() }}
          style={{ marginTop: '12px', padding: '9px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '6px' }}>
          📷 Take photo
        </button>
      </div>

      {drafts.length === 0 && (
        <div style={{ fontSize: '12px', color: '#9A9A92' }}>No receipts queued. (Upload wiring comes next.)</div>
      )}

      {drafts.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '11px', color: '#9A9A92' }}>Assign all to:</span>
          <select onChange={e => e.target.value && assignAll(e.target.value)} defaultValue=""
            style={{ padding: '6px 10px', background: '#242422', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '12px', borderRadius: '4px' }}>
            <option value="">—</option>
            {PROPS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={saveAll} disabled={busy} style={{ marginLeft: 'auto', padding: '8px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '6px' }}>
            {busy ? 'Saving…' : `Save all to expenses`}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {drafts.map((d, i) => (
          <div key={d.id || i} style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '6px', padding: '12px 14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr .8fr auto', gap: '8px', alignItems: 'center' }}>
              <input value={d.vendor || ''} onChange={e => edit(i, { vendor: e.target.value })} placeholder="Vendor"
                style={{ padding: '6px 8px', background: '#1E1E1C', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '12px', borderRadius: '3px' }} />
              <input value={d.amount ?? ''} onChange={e => edit(i, { amount: e.target.value })} placeholder="Amount"
                style={{ padding: '6px 8px', background: '#1E1E1C', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '12px', borderRadius: '3px' }} />
              <select value={d.property_id || ''} onChange={e => edit(i, { property_id: e.target.value })}
                style={{ padding: '6px 8px', background: '#1E1E1C', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '12px', borderRadius: '3px' }}>
                <option value="">Property…</option>
                {PROPS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: '#c47b7b', fontSize: '11px', cursor: 'pointer' }}>remove</button>
            </div>
            {d.line_items && d.line_items.length > 0 && (
              <div style={{ fontSize: '10px', color: '#666660', marginTop: '6px' }}>{d.line_items.length} item{d.line_items.length === 1 ? '' : 's'} extracted</div>
            )}
            {d._status === 'extracting' && <div style={{ fontSize: '10px', color: '#8A8A82', marginTop: '6px' }}>Reading…</div>}
            {d._status === 'error' && <div style={{ fontSize: '10px', color: '#c47b7b', marginTop: '6px' }}>{d._error}</div>}
            {d._dup && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '10px', color: d._dupOk ? '#8A8A82' : '#e6a86a' }}>
                <span>⚠️ {d._dup}</span>
                <button onClick={() => edit(i, { _dupOk: !d._dupOk } as any)} style={{ background: 'none', border: '0.5px solid #4A4A48', color: d._dupOk ? '#7bc47b' : '#e6a86a', fontSize: '9px', padding: '2px 8px', borderRadius: '3px', cursor: 'pointer' }}>{d._dupOk ? 'will save' : 'save anyway'}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
