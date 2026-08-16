'use client'
import { useState, useEffect, useRef } from 'react'

export default function GuideViewer({ propertyId }: { propertyId: string }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [exists, setExists] = useState(false)
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState<number[]>([])
  const [pageTexts, setPageTexts] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<any>(null)

  useEffect(() => {
    fetch(`/api/admin/guest-guide?property_id=${propertyId}`)
      .then(r => r.json())
      .then(d => { setExists(d.exists); setPdfUrl(d.url); })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [propertyId])

  // load + render the PDF with pdf.js from CDN
  useEffect(() => {
    if (!pdfUrl) return
    let cancelled = false
    ;(async () => {
      // load pdf.js
      if (!(window as any).pdfjsLib) {
        await new Promise<void>((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
          s.onload = () => res(); s.onerror = () => rej()
          document.head.appendChild(s)
        })
        ;(window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      }
      const pdfjsLib = (window as any).pdfjsLib
      const pdf = await pdfjsLib.getDocument(pdfUrl).promise
      if (cancelled) return
      pdfRef.current = pdf
      const texts: string[] = []
      const container = containerRef.current
      if (!container) return
      container.innerHTML = ''
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n)
        const viewport = page.getViewport({ scale: 1.2 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width; canvas.height = viewport.height
        canvas.style.width = '100%'; canvas.style.height = 'auto'
        canvas.style.borderRadius = '8px'; canvas.style.marginBottom = '12px'
        canvas.style.boxShadow = '0 1px 6px rgba(0,0,0,.06)'
        canvas.setAttribute('data-page', String(n))
        container.appendChild(canvas)
        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport }).promise
        // extract text for search
        const tc = await page.getTextContent()
        texts[n - 1] = tc.items.map((it: any) => it.str).join(' ').toLowerCase()
      }
      if (!cancelled) setPageTexts(texts)
    })()
    return () => { cancelled = true }
  }, [pdfUrl])

  function doSearch(q: string) {
    setSearch(q)
    if (!q.trim()) { setMatches([]); return }
    const found = pageTexts.map((t, i) => t.includes(q.toLowerCase()) ? i + 1 : 0).filter(Boolean)
    setMatches(found)
    if (found.length && containerRef.current) {
      const canvas = containerRef.current.querySelector(`[data-page="${found[0]}"]`)
      canvas?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  if (loading) return <p style={{ fontSize: '13px', color: '#9a938a' }}>Loading guide…</p>
  if (!exists || !pdfUrl) return <p style={{ fontSize: '14px', color: '#6a635a', lineHeight: 1.6 }}>The house guide isn't available yet. Please reach out via the concierge if you need anything.</p>

  return (
    <div>
      <div style={{ position: 'sticky', top: 0, background: '#faf9f5', paddingBottom: '12px', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '0.5px solid #e6e0d6', borderRadius: '20px', padding: '9px 14px' }}>
          <span style={{ fontSize: '13px', color: '#9a938a' }}>⌕</span>
          <input value={search} onChange={e => doSearch(e.target.value)} placeholder='Search the guide — "wifi", "parking"…'
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '13px', color: '#2a2724', fontFamily: 'inherit' }} />
        </div>
        {search.trim() && (
          <div style={{ fontSize: '11px', color: '#9a938a', marginTop: '8px' }}>
            {matches.length ? <>{matches.length} page{matches.length > 1 ? 's' : ''} match · <span style={{ color: '#B4552F' }}>page {matches.join(', ')}</span></> : 'No matches'}
          </div>
        )}
      </div>
      <div ref={containerRef} style={{ marginTop: '8px' }} />
    </div>
  )
}
