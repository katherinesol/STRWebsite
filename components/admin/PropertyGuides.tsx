'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const SECTIONS = [
  { id: 'getting-in', label: 'Getting in' },
  { id: 'wifi',       label: 'WiFi' },
  { id: 'kitchen',    label: 'Kitchen' },
  { id: 'bathroom',   label: 'Bathroom' },
  { id: 'living',     label: 'Living room' },
  { id: 'laundry',    label: 'Laundry' },
  { id: 'outdoor',    label: 'Outdoor' },
]

type Guide = {
  id: string
  section: string
  title: string
  content: string
  display_order: number
  updated_at?: string
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

export default function PropertyGuides({ propertyId, guides: initial }: { propertyId: string; guides: Guide[] }) {
  const router = useRouter()
  const [guides, setGuides] = useState<Guide[]>(initial)
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id)
  const [saving, setSaving] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')

  const sectionGuides = guides
    .filter(g => g.section === activeSection)
    .sort((a, b) => a.display_order - b.display_order)

  async function saveGuide(guide: Guide) {
    setSaving(guide.id)
    try {
      await fetch(`/api/admin/guides/${guide.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: guide.title, content: guide.content }),
      })
      router.refresh()
    } catch {}
    finally { setSaving(null) }
  }

  async function deleteGuide(id: string) {
    if (!confirm('Delete this guide entry?')) return
    await fetch(`/api/admin/guides/${id}`, { method: 'DELETE' })
    setGuides(gs => gs.filter(g => g.id !== id))
  }

  async function addGuide() {
    if (!newTitle || !newContent) return
    setSaving('new')
    try {
      const res = await fetch('/api/admin/guides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          section: activeSection,
          title: newTitle,
          content: newContent,
          display_order: sectionGuides.length + 1,
        }),
      })
      const data = await res.json()
      setGuides(gs => [...gs, data.guide])
      setNewTitle('')
      setNewContent('')
      setAdding(false)
    } catch {}
    finally { setSaving(null) }
  }

  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>
        Home guide
      </div>

      {/* section tabs */}
      <div style={{ display: 'flex', gap: '1px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => { setActiveSection(s.id); setAdding(false) }}
            style={{ padding: '8px 16px', background: activeSection === s.id ? '#F5F2EC' : '#363634', color: activeSection === s.id ? '#1A1A18' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* guide entries */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
        {sectionGuides.map(g => (
          <GuideEntry
            key={g.id}
            guide={g}
            saving={saving === g.id}
            onSave={saveGuide}
            onDelete={deleteGuide}
            onChange={(updated) => setGuides(gs => gs.map(x => x.id === updated.id ? updated : x))}
          />
        ))}
        {sectionGuides.length === 0 && !adding && (
          <div style={{ fontSize: '13px', color: '#666660', padding: '16px 0' }}>
            No entries for this section yet.
          </div>
        )}
      </div>

      {/* add new */}
      {adding ? (
        <div style={{ background: '#1E1E1C', border: '0.5px solid #363634', padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Title</div>
              <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Coffee & tea" style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Content</div>
              <textarea value={newContent} onChange={e => setNewContent(e.target.value)} rows={4} placeholder="Instructions..." style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setAdding(false); setNewTitle(''); setNewContent('') }}
                style={{ padding: '8px 16px', background: '#363634', color: '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={addGuide} disabled={!newTitle || !newContent || saving === 'new'}
                style={{ padding: '8px 16px', background: newTitle && newContent ? 'var(--amber)' : '#363634', color: newTitle && newContent ? '#1A1A18' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', fontWeight: 500 }}>
                {saving === 'new' ? 'Adding...' : 'Add entry'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ padding: '10px 20px', background: 'transparent', border: '0.5px solid #363634', color: '#9A9A92', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
          + Add entry
        </button>
      )}
    </div>
  )
}

function GuideEntry({ guide, saving, onSave, onDelete, onChange }: {
  guide: Guide
  saving: boolean
  onSave: (g: Guide) => void
  onDelete: (id: string) => void
  onChange: (g: Guide) => void
}) {
  const [saved, setSaved] = useState(false)

  return (
    <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '16px 20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input
          type="text"
          value={guide.title}
          onChange={e => onChange({ ...guide, title: e.target.value })}
          style={{ ...({ width: '100%', padding: '8px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px', fontWeight: 500, outline: 'none', borderRadius: '2px', boxSizing: 'border-box' as const }) }}
        />
        <textarea
          value={guide.content}
          onChange={e => onChange({ ...guide, content: e.target.value })}
          rows={3}
          style={{ width: '100%', padding: '8px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none', borderRadius: '2px', resize: 'vertical', boxSizing: 'border-box' as const }}
        />
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {guide.updated_at && (
            <span style={{ fontSize: '10px', color: '#555550', letterSpacing: '.06em' }}>
              Updated {new Date(guide.updated_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          )}
          <button
            onClick={async () => { await onSave(guide); setSaved(true); setTimeout(() => setSaved(false), 2000) }}
            disabled={saving}
            style={{ padding: '6px 16px', background: saving ? '#363634' : 'var(--amber)', color: saving ? '#9A9A92' : '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500 }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {saved && <span style={{ fontSize: '10px', color: '#2ecc71', letterSpacing: '.1em', textTransform: 'uppercase' }}>✓</span>}
          <button onClick={() => onDelete(guide.id)}
            style={{ padding: '6px 12px', background: 'transparent', border: '0.5px solid #3a1a1a', color: '#e74c3c', fontFamily: 'var(--sans)', fontSize: '10px', cursor: 'pointer', letterSpacing: '.08em', marginLeft: 'auto' }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
