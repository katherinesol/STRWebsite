'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

const PROPERTIES = [
  { id: 'royal-york-east', name: 'Royal York East' },
  { id: 'royal-york-west', name: 'Royal York West' },
  { id: 'nickel-beach', name: 'Nickel Beach' },
]

const CATEGORIES = ['Cleaning supplies', 'Linens', 'Guest supplies', 'Replace', 'Other']
const UNITS = ['units', 'rolls', 'bottles', 'bags', 'boxes', 'pairs', 'sets', 'litres', 'kg']

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  background: '#363634', border: '0.5px solid #4A4A48',
  color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px',
  outline: 'none', borderRadius: '2px', boxSizing: 'border-box',
}

type Supply = {
  id: string
  property_id: string
  name: string
  category: string
  unit: string
  quantity_on_hand: number
  reorder_point: number
  item_photo_url: string | null
  active: boolean
}

type Log = {
  id: string
  supply_id: string
  action: string
  quantity_change: number
  note: string | null
  photo_url: string | null
  logged_by: string
  created_at: string
}

export default function SuppliesManager({ supplies, logs, teamMembers }: {
  supplies: Supply[]
  logs: Log[]
  teamMembers: any[]
}) {
  const router = useRouter()
  const [activeProperty, setActiveProperty] = useState('royal-york-east')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingItem, setEditingItem] = useState<Supply | null>(null)
  const [actionItem, setActionItem] = useState<Supply | null>(null)
  const [actionType, setActionType] = useState<'restock' | 'flag' | null>(null)
  const [saving, setSaving] = useState(false)

  // new item form
  const [newItem, setNewItem] = useState({
    name: '', category: CATEGORIES[0], unit: 'units',
    quantity_on_hand: 0, reorder_point: 1,
  })

  // action form
  const [actionForm, setActionForm] = useState({
    quantity: 0, note: '', photo: null as File | null, logged_by: teamMembers.find(t => t.is_current_user)?.name || teamMembers[0]?.name || 'Admin',
  })

  const propertySupplies = supplies.filter(s => s.property_id === activeProperty)
  const categories = activeCategory
    ? propertySupplies.filter(s => s.category === activeCategory)
    : propertySupplies

  const grouped = CATEGORIES.reduce((acc, cat) => {
    const items = categories.filter(s => s.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {} as Record<string, Supply[]>)

  async function handleAddItem() {
    setSaving(true)
    try {
      await fetch('/api/admin/supplies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newItem, property_id: activeProperty }),
      })
      setNewItem({ name: '', category: CATEGORIES[0], unit: 'units', quantity_on_hand: 0, reorder_point: 1 })
      setShowAddForm(false)
      router.refresh()
    } catch {}
    finally { setSaving(false) }
  }

  async function handleEditItem() {
    if (!editingItem) return
    setSaving(true)
    try {
      await fetch(`/api/admin/supplies/${editingItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingItem),
      })
      setEditingItem(null)
      router.refresh()
    } catch {}
    finally { setSaving(false) }
  }

  async function handleDeleteItem(id: string, name: string) {
    if (!confirm(`Delete "${name}"? The restock history will be preserved.`)) return
    await fetch(`/api/admin/supplies/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  async function handleAction() {
    if (!actionItem || !actionType) return
    setSaving(true)
    const formData = new FormData()
    formData.append('supply_id', actionItem.id)
    formData.append('property_id', actionItem.property_id)
    formData.append('action', actionType === 'restock' ? 'restocked' : 'flagged')
    formData.append('quantity_change', String(actionType === 'restock' ? actionForm.quantity : 0))
    formData.append('note', actionForm.note)
    formData.append('logged_by', actionForm.logged_by)
    if (actionForm.photo) formData.append('photo', actionForm.photo)
    try {
      await fetch('/api/admin/supplies/log', { method: 'POST', body: formData })
      setActionItem(null)
      setActionType(null)
      setActionForm({ quantity: 0, note: '', photo: null, logged_by: actionForm.logged_by })
      router.refresh()
    } catch {}
    finally { setSaving(false) }
  }

  const isLow = (s: Supply) => s.quantity_on_hand <= s.reorder_point
  const recentLogs = (supplyId: string) => logs.filter(l => l.supply_id === supplyId).slice(0, 3)

  return (
    <div>
      {/* property tabs */}
      <div style={{ display: 'flex', gap: '1px', marginBottom: '20px' }}>
        {PROPERTIES.map(p => (
          <button key={p.id} onClick={() => setActiveProperty(p.id)}
            style={{ padding: '8px 20px', background: activeProperty === p.id ? '#F5F2EC' : '#363634', color: activeProperty === p.id ? '#1A1A18' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
            {p.name}
          </button>
        ))}
      </div>

      {/* category filter */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <button onClick={() => setActiveCategory(null)}
          style={{ padding: '5px 12px', background: !activeCategory ? 'var(--amber)' : '#363634', color: !activeCategory ? '#1A1A18' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
          All
        </button>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setActiveCategory(activeCategory === c ? null : c)}
            style={{ padding: '5px 12px', background: activeCategory === c ? 'var(--amber)' : '#363634', color: activeCategory === c ? '#1A1A18' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer' }}>
            {c}
          </button>
        ))}
      </div>

      {/* supplies list */}
      {Object.keys(grouped).length === 0 ? (
        <div style={{ fontSize: '13px', color: '#666660', padding: '32px 0' }}>No supplies added yet for this property.</div>
      ) : Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '8px' }}>{cat}</div>
          <div style={{ background: '#242422', border: '0.5px solid #363634' }}>
            {items.map(item => {
              const low = isLow(item)
              const itemLogs = recentLogs(item.id)
              const lastLog = itemLogs[0]
              return (
                <div key={item.id} style={{ padding: '14px 20px', borderBottom: '0.5px solid #363634' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        {item.item_photo_url && (
                          <img src={item.item_photo_url} alt={item.name} style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '2px' }} />
                        )}
                        <div style={{ fontSize: '14px', color: '#F5F2EC', fontWeight: 500 }}>{item.name}</div>
                        {low && <span style={{ fontSize: '9px', padding: '2px 8px', background: '#1f0a0a', color: '#e74c3c', border: '0.5px solid #3a1a1a', letterSpacing: '.08em', textTransform: 'uppercase' }}>Low stock</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: '#9A9A92' }}>
                        {item.quantity_on_hand} {item.unit} on hand · reorder at {item.reorder_point}
                        {lastLog && <span style={{ marginLeft: '12px', color: '#555550' }}>
                          Last {lastLog.action} by {lastLog.logged_by} on {format(new Date(lastLog.created_at), 'MMM d')}
                        </span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '12px' }}>
                      <button onClick={() => { setActionItem(item); setActionType('restock') }}
                        style={{ padding: '5px 12px', background: '#0a1f0f', color: '#2ecc71', border: '0.5px solid #0f2a14', fontFamily: 'var(--sans)', fontSize: '10px', cursor: 'pointer', letterSpacing: '.06em' }}>
                        Restock
                      </button>
                      <button onClick={() => { setActionItem(item); setActionType('flag') }}
                        style={{ padding: '5px 12px', background: '#1f1a0a', color: '#f39c12', border: '0.5px solid #2a2014', fontFamily: 'var(--sans)', fontSize: '10px', cursor: 'pointer', letterSpacing: '.06em' }}>
                        Flag
                      </button>
                      <button onClick={() => setEditingItem({ ...item })}
                        style={{ padding: '5px 10px', background: '#363634', color: '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '10px', cursor: 'pointer' }}>
                        Edit
                      </button>
                      <button onClick={() => handleDeleteItem(item.id, item.name)}
                        style={{ padding: '5px 10px', background: 'transparent', color: '#e74c3c', border: '0.5px solid #3a1a1a', fontFamily: 'var(--sans)', fontSize: '10px', cursor: 'pointer' }}>
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* add item button */}
      {!showAddForm ? (
        <button onClick={() => setShowAddForm(true)}
          style={{ padding: '10px 20px', background: 'transparent', border: '0.5px solid #363634', color: '#9A9A92', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
          + Add supply item
        </button>
      ) : (
        <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '24px', marginTop: '16px' }}>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '16px' }}>New supply item</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            {[
              { label: 'Item name', key: 'name', type: 'text' },
              { label: 'Unit', key: 'unit', type: 'select', options: UNITS },
              { label: 'Quantity on hand', key: 'quantity_on_hand', type: 'number' },
              { label: 'Reorder point', key: 'reorder_point', type: 'number' },
            ].map(({ label, key, type, options }) => (
              <div key={key}>
                <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>{label}</div>
                {type === 'select' ? (
                  <select value={(newItem as any)[key]} onChange={e => setNewItem(f => ({ ...f, [key]: e.target.value }))} style={{ ...inputStyle, background: '#363634' }}>
                    {options!.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={type} value={(newItem as any)[key]} onChange={e => setNewItem(f => ({ ...f, [key]: type === 'number' ? parseInt(e.target.value) || 0 : e.target.value }))} style={inputStyle} />
                )}
              </div>
            ))}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Category</div>
            <select value={newItem.category} onChange={e => setNewItem(f => ({ ...f, category: e.target.value }))} style={{ ...inputStyle, background: '#363634' }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowAddForm(false)} style={{ padding: '8px 16px', background: '#363634', color: '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleAddItem} disabled={!newItem.name || saving}
              style={{ padding: '8px 20px', background: newItem.name ? 'var(--amber)' : '#363634', color: newItem.name ? '#1A1A18' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', fontWeight: 500 }}>
              {saving ? 'Adding...' : 'Add item'}
            </button>
          </div>
        </div>
      )}

      {/* edit modal */}
      {editingItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '32px', width: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '22px', fontWeight: 300, color: '#F5F2EC', marginBottom: '20px' }}>Edit {editingItem.name}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { label: 'Name', key: 'name', type: 'text' },
                { label: 'Quantity on hand', key: 'quantity_on_hand', type: 'number' },
                { label: 'Reorder point', key: 'reorder_point', type: 'number' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>{label}</div>
                  <input type={type} value={(editingItem as any)[key]} onChange={e => setEditingItem(f => ({ ...f!, [key]: type === 'number' ? parseInt(e.target.value)||0 : e.target.value }))} style={inputStyle} />
                </div>
              ))}
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Category</div>
                <select value={editingItem.category} onChange={e => setEditingItem(f => ({ ...f!, category: e.target.value }))} style={{ ...inputStyle, background: '#363634' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Unit</div>
                <select value={editingItem.unit} onChange={e => setEditingItem(f => ({ ...f!, unit: e.target.value }))} style={{ ...inputStyle, background: '#363634' }}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setEditingItem(null)} style={{ flex: 1, padding: '10px', background: '#363634', color: '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleEditItem} disabled={saving} style={{ flex: 1, padding: '10px', background: 'var(--amber)', color: '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', fontWeight: 500 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* restock / flag modal */}
      {actionItem && actionType && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '32px', width: '440px' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '22px', fontWeight: 300, color: '#F5F2EC', marginBottom: '6px' }}>
              {actionType === 'restock' ? 'Restock' : 'Flag for restock'}
            </div>
            <div style={{ fontSize: '13px', color: '#9A9A92', marginBottom: '20px' }}>{actionItem.name} · {actionItem.property_id}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {actionType === 'restock' && (
                <div>
                  <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Quantity added</div>
                  <input type="number" value={actionForm.quantity} onChange={e => setActionForm(f => ({ ...f, quantity: parseInt(e.target.value)||0 }))} min={0} style={inputStyle} />
                </div>
              )}
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Note {actionType === 'flag' ? '(describe what needs replacing)' : '(optional)'}</div>
                <textarea value={actionForm.note} onChange={e => setActionForm(f => ({ ...f, note: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '5px' }}>Photo (optional)</div>
                <input type="file" accept="image/*" capture="environment"
                  onChange={e => setActionForm(f => ({ ...f, photo: e.target.files?.[0] || null }))}
                  style={{ fontSize: '12px', color: '#9A9A92' }} />
              </div>
              <div style={{ fontSize: '12px', color: '#555550' }}>Logged by: {actionForm.logged_by}</div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => { setActionItem(null); setActionType(null) }} style={{ flex: 1, padding: '10px', background: '#363634', color: '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAction} disabled={saving}
                style={{ flex: 1, padding: '10px', background: actionType === 'restock' ? '#2ecc71' : '#f39c12', color: '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', fontWeight: 500 }}>
                {saving ? 'Saving...' : actionType === 'restock' ? 'Mark restocked' : 'Submit flag'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
