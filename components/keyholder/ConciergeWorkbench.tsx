'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { L, F, microLabel, cardStyle } from '@/lib/design-tokens'

/** Design-doc 6b: what the concierge knows, and what it says, on one screen.
 *
 *  The two legacy pages split this in a way that made the useful move
 *  impossible: /admin/concierge let you ask a question and watch it fail, and
 *  /admin/knowledge let you add an entry — on a different page, with the failed
 *  question no longer in front of you. Teaching it from the question it just
 *  missed meant remembering the question and navigating away. Here the failure
 *  and the fix are the same gesture.
 *
 *  The test chat is the real brain: concierge-test builds the same system prompt
 *  from the same knowledge query as the guest bot, so what you see here is what
 *  a guest gets. Royal York East has no entries and is not special-cased — it
 *  will escalate everything, which is honestly what it would do for a guest. */

type Entry = { id: string; property_id: string; topic: string; title: string; content: string; active: boolean }
type Question = { id: string; question: string; bot_answer: string | null; needs_followup: boolean; answered: boolean; guest_contact: string | null; created_at: string }
type Msg = { role: 'user' | 'assistant'; content: string; escalated?: boolean }

export default function ConciergeWorkbench({
  properties, active, counts, entries, globalCount, questions,
}: {
  properties: { id: string; name: string }[]
  active: string
  counts: Record<string, number>
  entries: Entry[]
  globalCount: number
  questions: Question[]
}) {
  const router = useRouter()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [teaching, setTeaching] = useState<{ question: string; draft: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<{ title: string; topic: string; updated: boolean } | null>(null)
  const [err, setErr] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, teaching])

  const activeName = properties.find(p => p.id === active)?.name || active
  const unanswered = questions.filter(q => q.needs_followup && !q.answered)

  async function ask(q?: string) {
    const text = (q ?? input).trim()
    if (!text || busy) return
    const next: Msg[] = [...msgs, { role: 'user', content: text }]
    setMsgs(next); setInput(''); setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/concierge-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: active, messages: next.map(m => ({ role: m.role, content: m.content })) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error || 'Could not reach the concierge'); return }
      const raw = String(d.reply ?? d.message ?? '')
      /* The prompt makes it prefix [[ESCALATE]] when the knowledge base has
         nothing. The guest never sees the token; here it is the whole point. */
      const escalated = raw.includes('[[ESCALATE]]')
      setMsgs(m => [...m, { role: 'assistant', content: raw.replace('[[ESCALATE]]', '').trim(), escalated }])
    } catch { setErr('Could not reach the concierge') }
    finally { setBusy(false) }
  }

  /* Teach writes through concierge-train, which asks Claude only for a topic and
     a short title and saves the answer verbatim — the route's own comment reads
     "Do NOT reword the host's answer". If an entry with that title already
     exists for the property it is updated rather than duplicated. */
  async function teach() {
    if (!teaching?.draft.trim() || saving) return
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/admin/concierge-train', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: active, question: teaching.question || null, rough_answer: teaching.draft }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error || 'Could not save it'); return }
      setSaved({ title: d.entry?.title || 'Saved', topic: d.entry?.topic || 'general', updated: !!d.updated })
      setTeaching(null)
      router.refresh()
      setTimeout(() => setSaved(null), 6000)
    } catch { setErr('Could not save it') }
    finally { setSaving(false) }
  }

  const byTopic = entries.reduce<Record<string, Entry[]>>((acc, e) => {
    (acc[e.topic || 'general'] ||= []).push(e); return acc
  }, {})

  const btn: React.CSSProperties = {
    padding: '9px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    fontFamily: F.sans, border: `1px solid ${L.line}`, background: L.card, color: L.ink,
  }
  const chip = (on: boolean): React.CSSProperties => ({
    padding: '8px 14px', borderRadius: '99px', fontSize: '13px', fontWeight: on ? 600 : 400,
    cursor: 'pointer', textDecoration: 'none', border: `1px solid ${on ? 'transparent' : L.line}`,
    background: on ? L.ink : L.card, color: on ? '#fff' : L.inkBody,
  })

  return (
    <div style={{ paddingTop: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <span style={{ fontFamily: F.serif, fontSize: '36px', lineHeight: 1 }}>Concierge</span>
          <span style={{ fontSize: '14px', color: L.inkBody }}>
            What it knows, and what it says. Ask it something a guest would — the answer is the one they get.
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {properties.map(p => (
            <a key={p.id} href={`?p=${p.id}`} style={chip(p.id === active)}>
              {p.name}{' '}
              <span style={{ color: p.id === active ? 'oklch(0.85 0.02 80)' : counts[p.id] ? L.green : L.red, fontWeight: 600 }}>
                {counts[p.id]}
              </span>
            </a>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', alignItems: 'stretch' }}>

        {/* ── the chat ── */}
        <div style={{
          flex: 1, minWidth: 0, ...cardStyle, borderRadius: '18px', padding: '24px',
          display: 'flex', flexDirection: 'column', gap: '14px', height: 'calc(100vh - 300px)', minHeight: '520px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>Ask it something a guest would</span>
            <span style={{ marginLeft: 'auto', fontSize: '12px', color: L.inkMuted }}>answers as {activeName}</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', marginRight: '-8px', paddingRight: '8px' }}>
            {msgs.length === 0 && (
              <div style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={microLabel}>{counts[active] ? `${counts[active]} entries for ${activeName}` : `${activeName} has no knowledge yet`}</span>
                <span style={{ fontSize: '14px', color: L.inkBody, lineHeight: 1.55, maxWidth: '420px' }}>
                  {counts[active]
                    ? 'This is the same brain, the same knowledge and the same prompt a real guest reaches.'
                    : 'It will escalate everything, which is exactly what it would do for a real guest. Nothing here is special-cased.'}
                </span>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: m.role === 'user' ? '70%' : '82%',
                padding: m.role === 'user' ? '12px 15px' : '14px 16px',
                borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: m.role === 'user' ? L.ink : m.escalated ? L.amberWash : 'oklch(0.965 0.005 85)',
                border: m.escalated ? `1px solid ${L.amberLine}` : 'none',
                color: m.role === 'user' ? L.onInk : L.ink,
                fontSize: '14px', lineHeight: 1.55, whiteSpace: 'pre-wrap',
                display: 'flex', flexDirection: 'column', gap: '9px',
              }}>
                <span>{m.content}</span>
                {m.escalated && (
                  <>
                    <span style={{ fontSize: '12px', color: L.amber }}>
                      It escalated — nothing in {activeName}&rsquo;s knowledge covers this.
                    </span>
                    <button
                      onClick={() => setTeaching({ question: msgs[i - 1]?.content || '', draft: '' })}
                      style={{ ...btn, alignSelf: 'flex-start', background: L.ink, color: '#fff', border: 'none', fontSize: '12px' }}>
                      Teach it this answer
                    </button>
                  </>
                )}
              </div>
            ))}
            {busy && <span style={{ alignSelf: 'flex-start', fontSize: '14px', color: L.inkMuted }}>Thinking…</span>}

            {teaching && (
              <div style={{ ...cardStyle, border: `1px solid ${L.amberLine}`, borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ ...microLabel, color: L.amber }}>Teach it · {activeName}</span>
                {teaching.question && <span style={{ fontSize: '13px', color: L.inkBody }}>Asked: &ldquo;{teaching.question}&rdquo;</span>}
                <textarea value={teaching.draft} onChange={e => setTeaching(t => t && { ...t, draft: e.target.value })}
                  rows={3} autoFocus placeholder="Write the answer as you would say it to a guest…"
                  style={{ padding: '11px 13px', border: `1px solid ${L.line}`, borderRadius: '10px', fontSize: '14px', fontFamily: F.sans, resize: 'vertical', background: '#fff', color: L.ink }} />
                <span style={{ fontSize: '12px', color: L.inkFaint, lineHeight: 1.5 }}>
                  Saved word for word. Only the topic and the short title are worked out for you.
                </span>
                <div style={{ display: 'flex', gap: '9px' }}>
                  <button onClick={teach} disabled={saving || !teaching.draft.trim()}
                    style={{ ...btn, background: L.ink, color: '#fff', border: 'none', opacity: saving || !teaching.draft.trim() ? 0.5 : 1 }}>
                    {saving ? 'Saving…' : 'Save it'}
                  </button>
                  <button onClick={() => setTeaching(null)} disabled={saving} style={btn}>Cancel</button>
                </div>
              </div>
            )}
            {saved && (
              <div style={{ ...cardStyle, background: 'oklch(0.975 0.02 155)', border: '1px solid oklch(0.85 0.06 155)', borderRadius: '12px', padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '13px', color: 'oklch(0.36 0.10 155)' }}>
                  {saved.updated ? 'Updated' : 'Saved'} under <strong>{saved.topic}</strong> as &ldquo;{saved.title}&rdquo;.
                </span>
                <span style={{ fontSize: '12px', color: L.inkMuted }}>Ask the same thing again — it should answer now instead of escalating.</span>
              </div>
            )}
            {err && <span style={{ fontSize: '13px', color: L.red }}>{err}</span>}
            <div ref={endRef} />
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', gap: '10px' }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ask() } }}
              placeholder="Ask as a guest…"
              style={{ flex: 1, padding: '13px 15px', border: `1px solid ${L.line}`, borderRadius: '11px', fontSize: '14px', fontFamily: F.sans, background: '#fff', color: L.ink }} />
            <button onClick={() => ask()} disabled={busy || !input.trim()}
              style={{ ...btn, padding: '13px 20px', borderRadius: '11px', background: L.ink, color: '#fff', border: 'none', opacity: busy || !input.trim() ? 0.5 : 1 }}>
              Send
            </button>
          </div>
        </div>

        {/* ── what it knows ── */}
        <div className="kh-rail" style={{ width: '440px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {unanswered.length > 0 && (
            <div style={{ ...cardStyle, border: `1px solid ${L.amberLine}`, overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', background: L.amberWash, borderBottom: `1px solid ${L.amberLine}` }}>
                <span style={{ ...microLabel, color: L.amber }}>Questions it couldn&rsquo;t answer · {unanswered.length}</span>
              </div>
              {unanswered.map((q, i) => (
                <div key={q.id} style={{ padding: '13px 20px', borderTop: i ? `1px solid ${L.lineFaint}` : 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '13px' }}>&ldquo;{q.question}&rdquo;</span>
                    <span style={{ fontSize: '11px', color: L.inkMuted }}>{q.guest_contact || 'a guest'} · {String(q.created_at).slice(0, 10)}</span>
                  </div>
                  <button onClick={() => setTeaching({ question: q.question, draft: '' })}
                    style={{ ...btn, padding: '7px 12px', fontSize: '12px', color: L.link, borderColor: L.line }}>Teach</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ ...cardStyle, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${L.lineSoft}`, display: 'flex', alignItems: 'baseline', gap: '10px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600 }}>What it knows</span>
              <span style={{ marginLeft: 'auto', fontFamily: F.mono, fontSize: '11px', color: L.inkMuted }}>
                {entries.length} entries{globalCount ? ` · ${globalCount} shared` : ''}
              </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {entries.length === 0 ? (
                <div style={{ padding: '20px', fontSize: '13px', color: L.inkMuted, lineHeight: 1.55 }}>
                  Nothing yet for {activeName}. Every question will escalate to you until there is.
                </div>
              ) : Object.entries(byTopic).map(([topic, list]) => (
                <div key={topic}>
                  <div style={{ padding: '9px 20px', background: L.cardAlt, borderBottom: `1px solid ${L.lineFaint}` }}>
                    <span style={microLabel}>{topic} · {list.length}</span>
                  </div>
                  {list.map(e => (
                    <div key={e.id} style={{ padding: '12px 20px', borderBottom: `1px solid ${L.lineFaint}`, display: 'flex', flexDirection: 'column', gap: '3px', opacity: e.active ? 1 : 0.5 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>{e.title}</span>
                        {e.property_id === 'general' && <span style={{ ...microLabel, color: L.inkFaint }}>shared</span>}
                        {!e.active && <span style={{ ...microLabel, color: L.red }}>off</span>}
                      </div>
                      <span style={{ fontSize: '13px', color: L.inkBody, lineHeight: 1.5 }}>{e.content}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ padding: '14px 20px', borderTop: `1px solid ${L.lineSoft}`, display: 'flex', gap: '9px' }}>
              <button onClick={() => setTeaching({ question: '', draft: '' })} style={{ ...btn, flex: 1 }}>
                Add something it should know
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
