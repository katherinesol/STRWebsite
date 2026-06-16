'use client'
import { useState } from 'react'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: '#363634',
  border: '0.5px solid #4A4A48', color: '#F5F2EC',
  fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
}

type Contact = { id: string; name: string; role: string | null; emails: string[]; phones: string[]; notes: string | null }

export default function ContactsManager({ initialContacts }: { initialContacts: Contact[] }) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [emails, setEmails] = useState('')
  const [saving, setSaving] = useState(false)

  async function addContact() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim() || null,
          emails: emails.split(',').map(e => e.trim()).filter(Boolean),
        }),
      })
      const data = await res.json()
      if (data.contact) {
        setContacts(c => [...c, data.contact].sort((a, b) => a.name.localeCompare(b.name)))
        setName(''); setRole(''); setEmails(''); setAdding(false)
      }
    } finally { setSaving(false) }
  }

  async function deleteContact(id: string) {
    if (!confirm('Delete this contact?')) return
    setContacts(c => c.filter(x => x.id !== id))
    await fetch(`/api/admin/contacts?id=${id}`, { method: 'DELETE' })
  }

  return (
    <div style={{ maxWidth: '720px' }}>
      {!adding ? (
        <button onClick={() => setAdding(true)}
          style={{ padding: '10px 20px', background: 'var(--amber)', color: '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 500, marginBottom: '20px' }}>
          + Add contact
        </button>
      ) : (
        <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Name *</div>
              <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} autoFocus />
            </div>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Role (optional)</div>
              <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Cleaner, Supplier" style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Emails (comma-separated)</div>
            <input value={emails} onChange={e => setEmails(e.target.value)} placeholder="dan@gmail.ca, daniel@work.com" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={addContact} disabled={saving || !name.trim()}
              style={{ padding: '9px 20px', background: 'var(--amber)', color: '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 500 }}>
              {saving ? 'Saving…' : 'Save contact'}
            </button>
            <button onClick={() => setAdding(false)}
              style={{ padding: '9px 16px', background: '#363634', color: '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {contacts.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', fontSize: '13px', color: '#666660' }}>No contacts yet</div>
      ) : (
        <div style={{ background: '#242422', border: '0.5px solid #363634' }}>
          {contacts.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '0.5px solid #363634' }}>
              <div>
                <div style={{ fontSize: '14px', color: '#F5F2EC', fontWeight: 500 }}>
                  {c.name} {c.role && <span style={{ fontSize: '11px', color: '#9A9A92', fontWeight: 400 }}>· {c.role}</span>}
                </div>
                <div style={{ fontSize: '12px', color: '#9A9A92', marginTop: '2px' }}>{(c.emails || []).join(', ') || 'No emails'}</div>
              </div>
              <button onClick={() => deleteContact(c.id)} style={{ padding: '5px 10px', background: '#2a1518', border: 'none', color: '#e74c3c', fontFamily: 'var(--sans)', fontSize: '10px', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
