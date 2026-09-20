'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { L, microLabel } from '@/lib/design-tokens'

/*  Searching the guests table, not the loaded page.
 *
 *  The list had no search at all. Adding a box that filters the array already on
 *  screen would have looked identical and been wrong the day the list outgrows
 *  one page — and the failure mode is the worst kind: a guest who IS in the
 *  system appears not to be.
 *
 *  So the term goes into the URL, the server re-queries, and what comes back is
 *  the whole table's answer. It also means a search can be linked, bookmarked
 *  and reloaded, which a piece of component state cannot.
 *
 *  Debounced, because every keystroke is otherwise a round trip; replace rather
 *  than push, so the back button leaves the page instead of walking back
 *  through half-typed queries. */
export default function GuestSearch({ initial }: { initial: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [q, setQ] = useState(initial)

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(Array.from(params.entries()))
      const term = q.trim()
      if (term) next.set('q', term); else next.delete('q')
      const qs = next.toString()
      if (term !== (params.get('q') || '')) router.replace(qs ? `?${qs}` : '?', { scroll: false })
    }, 250)
    return () => clearTimeout(t)
  }, [q, params, router])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '460px' }}>
      <label style={microLabel} htmlFor="guest-search">Find a guest</label>
      <div style={{ position: 'relative' }}>
        <input
          id="guest-search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Name, email or phone"
          autoComplete="off"
          style={{
            width: '100%', padding: '11px 36px 11px 13px', boxSizing: 'border-box',
            borderRadius: '9px', border: `1px solid ${L.line}`, background: L.card,
            fontSize: '14.5px', color: L.ink, outline: 'none', fontFamily: 'inherit',
          }}
        />
        {q && (
          <button
            onClick={() => setQ('')}
            aria-label="Clear the search"
            style={{
              position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
              border: 'none', background: 'none', cursor: 'pointer', padding: '4px 6px',
              color: L.inkFaint, fontSize: '15px', lineHeight: 1,
            }}
          >×</button>
        )}
      </div>
      {q.trim().length === 1 && (
        <span style={{ fontSize: '12.5px', color: L.inkFaint }}>Keep typing — searching from two characters.</span>
      )}
    </div>
  )
}
