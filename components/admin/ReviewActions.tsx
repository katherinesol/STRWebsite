'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ReviewActions({ review }: { review: { id: string; published: boolean; host_reply: string | null } }) {
  const router = useRouter()
  const [reply, setReply] = useState(review.host_reply || '')
  const [showReply, setShowReply] = useState(false)
  const [saving, setSaving] = useState(false)

  async function update(updates: Record<string, unknown>) {
    setSaving(true)
    await fetch(`/api/admin/reviews/${review.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    setSaving(false)
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '140px' }}>
      {!review.published ? (
        <button onClick={() => update({ published: true })} disabled={saving}
          style={{ padding: '8px 14px', background: '#0a1f0f', color: '#2ecc71', border: '0.5px solid #1a3a1f', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
          ✓ Publish
        </button>
      ) : (
        <button onClick={() => update({ published: false })} disabled={saving}
          style={{ padding: '8px 14px', background: '#1f0a0a', color: '#e74c3c', border: '0.5px solid #3a1a1a', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
          Unpublish
        </button>
      )}
      <button onClick={() => setShowReply(r => !r)}
        style={{ padding: '8px 14px', background: '#363634', color: '#AEAEA6', border: 'none', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
        {review.host_reply ? 'Edit reply' : 'Reply'}
      </button>
      {showReply && (
        <div style={{ position: 'absolute', right: 0, top: '100%', width: '320px', background: '#242422', border: '0.5px solid #363634', padding: '16px', zIndex: 10, marginTop: '4px' }}>
          <textarea value={reply} onChange={e => setReply(e.target.value)} rows={4} placeholder="Write your reply..."
            style={{ width: '100%', padding: '10px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: '8px' }}
          />
          <button onClick={() => { update({ host_reply: reply }); setShowReply(false) }} disabled={saving}
            style={{ width: '100%', padding: '8px', background: 'var(--amber)', color: '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 500 }}>
            Save reply
          </button>
        </div>
      )}
    </div>
  )
}
