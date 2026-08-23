'use client'
import { useState, useRef, useEffect } from 'react'
import { L, F, microLabel, cardStyle } from '@/lib/design-tokens'
import BookingProposalCard from './BookingProposalCard'

// Haussy in the new shell.
//
// Two ways in, one way out: typed text goes through the propose_booking tool,
// screenshots go through the vision extractor, and BOTH land on the same priced
// preview and the same transactional write. Nothing typed or pasted reaches the
// database without passing that card.

const SUGGESTIONS = [
  'Book Sarah Chen at Nickel Beach Aug 14–17, $250 a night, direct',
  'What check-ins are coming up?',
  'Which bookings are missing their payout figures?',
  'Remind me to file the Q3 MAT return',
]

const TASK_FIELDS = ['title', 'description', 'due_date', 'cadence', 'priority', 'property_id']

export default function HaussyChat() {
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [pendingImages, setPendingImages] = useState<any[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  // booking proposal
  const [draft, setDraft] = useState<any>(null)
  const [preview, setPreview] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  // task proposal
  const [draftTask, setDraftTask] = useState<any>(null)
  const [taskId, setTaskId] = useState<string>('')
  const [taskSaving, setTaskSaving] = useState(false)

  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy, preview])
  useEffect(() => {
    fetch('/api/admin/haussy/history').then(r => r.json()).then(d => {
      if (d.session_id) setSessionId(d.session_id)
      if (d.messages?.length) setMessages(d.messages.map((m: any) => ({ role: m.role, content: m.content, image_urls: m.image_urls || [] })))
    }).catch(() => {})
  }, [])

  async function saveMessage(role: string, content: string, images?: any[]) {
    try {
      const d = await fetch('/api/admin/haussy/history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, role, content, images: images || [] }),
      }).then(r => r.json())
      if (d.session_id && !sessionId) setSessionId(d.session_id)
    } catch {}
  }

  function newChat() {
    setSessionId(null); setMessages([]); setDraft(null); setPreview(null); setDraftTask(null)
    setPendingImages([]); setNote(''); setErr('')
  }

  // ---- priced preview: the only route to a write ----
  async function priceIt(next: any) {
    setErr('')
    const res = await fetch('/api/admin/haussy/booking', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft: next }),
    })
    const d = await res.json().catch(() => ({}))
    if (!d.ok) { setErr(d.error || 'Could not price that booking'); setPreview(null); return }
    setPreview(d)
  }

  function editDraft(patch: any) {
    const next = { ...draft, ...patch }
    setDraft(next)
    priceIt(next)
  }

  async function confirmBooking({ createExpenses, ids, mode, targetId }: { createExpenses: boolean; ids: any; mode: 'create' | 'merge'; targetId?: string }) {
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/admin/haussy/booking', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft, commit: true, ids, create_expenses: createExpenses, mode, target_id: targetId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!d.applied) { setErr(d.error || 'Could not create the booking'); return }
      const taxBit = d.tax.apply_tax ? `HST ${d.tax.hst.toFixed(2)} · MAT ${d.tax.mat.toFixed(2)}` : 'no tax applied'
      setNote(d.result?.already
        ? 'Already done — the repeat submit was ignored, nothing written twice.'
        : mode === 'merge'
          ? `Filled in ${draft.guest_name || 'the booking'} · ${taxBit}.`
          : `Booking created for ${draft.guest_name || 'guest'} · ${taxBit}.`)
      setDraft(null); setPreview(null)
    } catch { setErr('Could not reach the server — nothing was written.') }
    finally { setSaving(false) }
  }

  async function send(text?: string) {
    const q = (text ?? input).trim()
    if (pendingImages.length) return extractFromImages(q)
    if (!q || busy) return
    const next = [...messages, { role: 'user', content: q }]
    setMessages(next); setInput(''); setBusy(true); setErr('')
    saveMessage('user', q)
    try {
      const res = await fetch('/api/admin/haussy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      })
      const d = await res.json()
      if (d.error) { setMessages(m => [...m, { role: 'assistant', content: d.error }]); return }
      setMessages(m => [...m, { role: 'assistant', content: d.answer || '(no response)' }])
      saveMessage('assistant', d.answer || '(no response)')
      const bk = (d.tools || []).find((x: any) => x.tool === 'propose_booking')
      if (bk?.input) { const dr = { ...bk.input }; setDraft(dr); await priceIt(dr) }
      const tk = (d.tools || []).find((x: any) => x.tool === 'propose_task')
      if (tk?.input) { setDraftTask({ ...tk.input }); setTaskId(crypto.randomUUID()) }
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Something went wrong.' }])
    } finally { setBusy(false) }
  }

  function fileToImg(file: File): Promise<any> {
    return new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res({ data: String(r.result).split(',')[1], mediaType: file.type || 'image/jpeg' })
      r.onerror = rej
      r.readAsDataURL(file)
    })
  }
  async function addFiles(files: FileList | null) {
    if (!files?.length) return
    const imgs = await Promise.all(Array.from(files).map(fileToImg))
    setPendingImages(prev => [...prev, ...imgs])
  }
  function onPaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/'))
    if (!items.length) return
    e.preventDefault()
    Promise.all(items.map(i => fileToImg(i.getAsFile()!))).then(imgs => setPendingImages(p => [...p, ...imgs]))
  }

  async function extractFromImages(pasted?: string) {
    if (!pendingImages.length) return
    setExtracting(true); setErr(''); setPreview(null)
    const label = (pasted || '') + ` [${pendingImages.length} screenshot${pendingImages.length > 1 ? 's' : ''}]`
    setMessages(m => [...m, { role: 'user', content: label, image_urls: pendingImages.map((i: any) => `data:${i.mediaType};base64,${i.data}`) }])
    await saveMessage('user', label, pendingImages)
    setInput('')
    try {
      const res = await fetch('/api/admin/haussy/extract-booking', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: pendingImages, text: pasted || '' }),
      })
      const d = await res.json()
      if (d.error) { setErr(d.error); return }
      // a screenshot is always a platform booking; it came through a platform
      const dr = { ...d.extracted, kind: 'platform', property_id: d.extracted.property_id || '' }
      setPendingImages([]); setDraft(dr)
      if (dr.property_id) await priceIt(dr)
      else setErr('Could not tell which property — open "Edit fields" and pick one.')
      const miss = d.extracted?.completeness?.missing || []
      const warn = d.extracted?.completeness?.warnings || []
      if (miss.length || warn.length) {
        setMessages(m => [...m, { role: 'assistant', content: [...warn, ...miss.map((x: string) => 'Missing: ' + x)].join('\n') }])
      }
    } finally { setExtracting(false) }
  }

  /* 6a: the two bubble shapes differ — the tail corner points at its author,
     and the assistant is allowed to run wider because it does the explaining. */
  const bubble = (role: string): React.CSSProperties => ({
    maxWidth: role === 'user' ? '70%' : '82%',
    padding: role === 'user' ? '12px 15px' : '14px 16px',
    borderRadius: role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
    fontSize: '14px', lineHeight: 1.55, whiteSpace: 'pre-wrap',
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    background: role === 'user' ? L.ink : 'oklch(0.965 0.005 85)',
    color: role === 'user' ? L.onInk : L.ink,
  })

  const railCard: React.CSSProperties = {
    ...cardStyle, borderRadius: '18px', padding: '22px',
    display: 'flex', flexDirection: 'column', gap: '12px',
  }

  return (
    <div style={{ display: 'flex', gap: '20px', paddingTop: '30px', alignItems: 'stretch' }}>

      {/* ─────────── conversation ─────────── */}
      <div style={{ flex: 1.6, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontFamily: F.serif, fontSize: '36px', lineHeight: 1 }}>Haussy</span>
            <span style={{ fontSize: '14px', color: L.inkBody }}>
              Reads everything you have. Changes nothing without your yes.
            </span>
          </div>
          <button onClick={newChat} style={{ marginLeft: 'auto', padding: '10px 16px', borderRadius: '10px', background: L.card, border: `1px solid ${L.line}`, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: F.sans, color: L.ink }}>
            New chat
          </button>
        </div>

        {note && (
          <div style={{ ...cardStyle, border: `1px solid ${L.amberLine}`, background: L.amberWash, borderRadius: '14px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontSize: '14px' }}>{note}</span>
            <button onClick={() => setNote('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: L.inkMuted, cursor: 'pointer', fontSize: '13px', fontFamily: F.sans }}>Dismiss</button>
          </div>
        )}

        {/* One card holds the transcript AND the composer. The composer sits at
            margin-top:auto inside it rather than position:sticky over the page,
            which is what used to let messages slide underneath the Send button. */}
        <div style={{
          ...cardStyle, borderRadius: '18px', padding: '24px',
          display: 'flex', flexDirection: 'column', gap: '14px',
          height: 'calc(100vh - 260px)', minHeight: '540px',
        }}>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', marginRight: '-8px', paddingRight: '8px' }}>
            {messages.length === 0 && (
              <div style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
                <span style={microLabel}>Nothing asked yet</span>
                <span style={{ fontSize: '14px', color: L.inkBody, lineHeight: 1.55, maxWidth: '440px' }}>
                  Ask a question, describe a booking in your own words, or paste platform
                  screenshots and I&rsquo;ll read the figures off them.
                </span>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: '8px' }}>
                {m.image_urls?.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {m.image_urls.map((u: string, j: number) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={j} src={u} alt="" style={{ width: '96px', height: '66px', objectFit: 'cover', borderRadius: '8px', border: `1px solid ${L.line}` }} />
                    ))}
                  </div>
                )}
                {m.content && <div style={bubble(m.role)}>{m.content}</div>}
              </div>
            ))}
            {(busy || extracting) && <div style={{ ...bubble('assistant'), color: L.inkMuted }}>{extracting ? 'Reading the screenshots…' : 'Thinking…'}</div>}

            {preview && (
              <BookingProposalCard draft={draft} preview={preview} busy={saving} err={err}
                onEdit={editDraft} onConfirm={confirmBooking}
                onCancel={() => { setDraft(null); setPreview(null); setErr('') }} />
            )}

            {draftTask && (
              <div style={{ ...cardStyle, border: `1px solid ${L.amberLine}`, borderRadius: '14px', overflow: 'hidden', alignSelf: 'flex-start', width: '82%' }}>
                <div style={{ padding: '12px 16px', background: L.amberWash, borderBottom: `1px solid ${L.amberLine}` }}>
                  <span style={{ ...microLabel, color: L.amber }}>Proposed task · nothing saved yet</span>
                </div>
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <span style={{ fontFamily: F.serif, fontSize: '21px' }}>{draftTask.title || 'Untitled task'}</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                    {TASK_FIELDS.map(k => (
                      <div key={k}>
                        <div style={microLabel}>{k.replace(/_/g, ' ')}</div>
                        <input value={draftTask[k] ?? ''} onChange={e => setDraftTask((t: any) => ({ ...t, [k]: e.target.value }))}
                          style={{ padding: '9px 11px', border: `1px solid ${L.line}`, borderRadius: '9px', fontSize: '14px', fontFamily: F.sans, width: '100%', boxSizing: 'border-box', marginTop: '4px' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '9px' }}>
                    <button disabled={taskSaving} onClick={async () => {
                      setTaskSaving(true)
                      const res = await fetch('/api/admin/haussy/create-task', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ task: draftTask, task_id: taskId }),
                      })
                      const d = await res.json()
                      setTaskSaving(false)
                      if (d.error) setErr(d.error)
                      else { setNote(`Task created: ${d.task?.title}`); setDraftTask(null) }
                    }} style={{ padding: '10px 16px', borderRadius: '9px', background: L.ink, color: '#fff', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: F.sans }}>
                      {taskSaving ? 'Creating…' : 'Create the task'}
                    </button>
                    <button onClick={() => setDraftTask(null)} style={{ padding: '10px 16px', borderRadius: '9px', background: 'transparent', border: `1px solid ${L.line}`, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: F.sans }}>
                      Discard
                    </button>
                  </div>
                </div>
              </div>
            )}

            {err && !preview && <span style={{ fontSize: '13px', color: L.red }}>{err}</span>}
            <div ref={endRef} />
          </div>

          {pendingImages.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', color: L.inkMuted }}>{pendingImages.length} screenshot{pendingImages.length > 1 ? 's' : ''} ready</span>
              <button onClick={() => setPendingImages([])} style={{ padding: '6px 12px', borderRadius: '8px', background: 'transparent', border: `1px solid ${L.line}`, fontSize: '12px', cursor: 'pointer', fontFamily: F.sans }}>Clear</button>
            </div>
          )}

          <div style={{ marginTop: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => addFiles(e.target.files)} />
            <button onClick={() => fileRef.current?.click()} title="Attach booking screenshots"
              style={{ width: '40px', height: '40px', flex: 'none', borderRadius: '11px', background: L.card, border: `1px solid ${L.line}`, fontSize: '15px', color: L.inkMuted, cursor: 'pointer', fontFamily: F.sans }}>▤</button>
            <textarea value={input} onChange={e => setInput(e.target.value)} onPaste={onPaste} rows={1}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Ask, or paste booking screenshots…"
              style={{ flex: 1, padding: '13px 15px', borderRadius: '11px', border: `1px solid ${L.line}`, fontSize: '14px', fontFamily: F.sans, resize: 'none', background: '#fff', color: L.ink, boxSizing: 'border-box' }} />
            <button onClick={() => send()} disabled={busy || extracting || (!input.trim() && !pendingImages.length)}
              style={{ padding: '13px 20px', flex: 'none', borderRadius: '11px', background: L.ink, color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: F.sans, opacity: (busy || extracting) ? 0.6 : 1 }}>
              Send
            </button>
          </div>
        </div>
      </div>

      {/* ─────────── rail ─────────── */}
      <div className="kh-rail" style={{ width: '320px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={railCard}>
          <span style={{ fontSize: '15px', fontWeight: 600 }}>Start from</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => send(s)} style={{
                textAlign: 'left', padding: '11px 14px', borderRadius: '10px', background: L.card,
                border: `1px solid ${L.line}`, fontSize: '13px', lineHeight: 1.45,
                cursor: 'pointer', fontFamily: F.sans, color: L.ink,
              }}>{s}</button>
            ))}
          </div>
        </div>

        <div style={railCard}>
          <span style={{ fontSize: '15px', fontWeight: 600 }}>What it can touch</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: L.inkBody }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <span style={{ color: L.green, minWidth: '62px', flex: 'none' }}>reads</span>
              <span style={{ lineHeight: 1.45 }}>bookings, platform stays, guests, invoices, expenses, tasks, messages, reviews and the cistern log — 17 tables, 8 of them owner-only</span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <span style={{ color: L.amber, minWidth: '62px', flex: 'none' }}>proposes</span>
              <span style={{ lineHeight: 1.45 }}>a new booking, figures filled into one you already have, an owner date-block, or a task reminder</span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <span style={{ color: L.red, minWidth: '62px', flex: 'none' }}>never</span>
              <span style={{ lineHeight: 1.45 }}>writes anything until you press confirm on the card</span>
            </div>
          </div>
        </div>

        <div style={{ ...railCard, flex: 1 }}>
          <span style={{ fontSize: '15px', fontWeight: 600 }}>Your chats</span>
          <span style={{ fontSize: '13px', color: L.inkMuted, lineHeight: 1.55 }}>
            Kept, and reloaded when you open this page. <b style={{ fontWeight: 600, color: L.ink }}>New chat</b> starts
            a fresh one rather than clearing the old.
          </span>
          <span style={{ fontSize: '13px', color: L.inkMuted, lineHeight: 1.55 }}>
            Haussy itself will tell you it has no memory. It is wrong — nothing in its
            instructions mentions the history, so it guesses.
          </span>
        </div>
      </div>
    </div>
  )
}
