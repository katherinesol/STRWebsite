'use client'
import { useState } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO, isBefore, isAfter, isSameDay, addMonths, subMonths } from 'date-fns'
import { useRouter } from 'next/navigation'

const PROPERTIES = [
  { id: 'royal-york-east', label: 'East', color: '#B8956B' },
  { id: 'royal-york-west', label: 'West', color: '#3D6ECC' },
  { id: 'nickel-beach',    label: 'Nickel', color: '#2ECC71' },
]

const STATUS_COLORS: Record<string, string> = {
  confirmed:       '#2ecc71',
  active:          '#3498db',
  pending_payment: '#f39c12',
}

const BLOCK_REASONS: Record<string, string> = {
  manual:      'Manual block',
  cleaning:    'Cleaning',
  maintenance: 'Maintenance',
  owner:       'Owner stay',
}

type Booking = {
  id: string
  property_id: string
  check_in: string
  check_out: string
  status: string
  guests: { name: string } | { name: string }[] | null
}

type Block = {
  id: string
  property_id: string
  start_date: string
  end_date: string
  reason: string
  notes: string | null
  guest_name: string | null
  guest_notes: string | null
  platform: string | null
  early_checkin_time: string | null
  late_checkout_time: string | null
  early_checkin_granted: boolean | null
  late_checkout_granted: boolean | null
}

function isDateInRange(date: Date, start: string, end: string): boolean {
  const s = parseISO(start)
  const e = parseISO(end)
  return (isSameDay(date, s) || isAfter(date, s)) && isBefore(date, e)
}

export default function CalendarView({ bookings, blocks }: { bookings: Booking[]; blocks: Block[] }) {
  const router = useRouter()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null)
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [blockStart, setBlockStart] = useState('')
  const [blockEnd, setBlockEnd] = useState('')
  const [blockReason, setBlockReason] = useState('manual')
  const [blockNotes, setBlockNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [icalStatus, setIcalStatus] = useState<Record<string, 'idle' | 'loading' | 'done' | 'error'>>({})
  const [editingBlock, setEditingBlock] = useState<Block | null>(null)
  const [editForm, setEditForm] = useState<Partial<Block>>({})
  const [editSaving, setEditSaving] = useState(false)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // pad start of month
  const startPad = monthStart.getDay()
  const paddedDays = [...Array(startPad).fill(null), ...days]

  function getBookingsForDay(date: Date, propertyId: string): Booking[] {
    return bookings.filter(b =>
      b.property_id === propertyId && isDateInRange(date, b.check_in, b.check_out)
    )
  }

  function getBlocksForDay(date: Date, propertyId: string): Block[] {
    return blocks.filter(b =>
      b.property_id === propertyId && isDateInRange(date, b.start_date, b.end_date)
    )
  }

  function openEditBlock(block: Block) {
    setEditingBlock(block)
    setEditForm({
      guest_name: block.guest_name || '',
      guest_notes: block.guest_notes || '',
      platform: block.platform || 'manual',
      early_checkin_time: block.early_checkin_time || '',
      late_checkout_time: block.late_checkout_time || '',
      early_checkin_granted: block.early_checkin_granted,
      late_checkout_granted: block.late_checkout_granted,
      notes: block.notes || '',
    })
  }

  async function handleSaveBlock() {
    if (!editingBlock) return
    setEditSaving(true)
    try {
      await fetch(`/api/admin/calendar/block/${editingBlock.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      setEditingBlock(null)
      router.refresh()
    } catch {}
    finally { setEditSaving(false) }
  }

  async function handleAddBlock() {
    if (!blockStart || !blockEnd) return
    setSaving(true)
    try {
      await fetch('/api/admin/calendar/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: selectedProperty || 'royal-york-east',
          start_date: blockStart,
          end_date: blockEnd,
          reason: blockReason,
          notes: blockNotes,
        }),
      })
      setShowBlockModal(false)
      setBlockStart(''); setBlockEnd(''); setBlockNotes('')
      router.refresh()
    } catch {}
    finally { setSaving(false) }
  }

  async function handleRemoveBlock(blockId: string) {
    await fetch(`/api/admin/calendar/block/${blockId}`, { method: 'DELETE' })
    router.refresh()
  }

  async function refreshICal(propertyId: string) {
    setIcalStatus(s => ({ ...s, [propertyId]: 'loading' }))
    try {
      await fetch(`/api/calendar?property=${propertyId}&save=1`)
      setIcalStatus(s => ({ ...s, [propertyId]: 'done' }))
      router.refresh()
    } catch {
      setIcalStatus(s => ({ ...s, [propertyId]: 'error' }))
    }
  }

  const visibleProperties = selectedProperty
    ? PROPERTIES.filter(p => p.id === selectedProperty)
    : PROPERTIES

  return (
    <div>
      {/* header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.16em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Management</div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 300, color: '#F5F2EC', lineHeight: 1 }}>Calendar.</h1>
        </div>
        <button
          onClick={() => setShowBlockModal(true)}
          style={{ padding: '10px 20px', background: 'var(--amber)', color: '#242422', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}
        >
          + Block dates
        </button>
      </div>

      {/* iCal sync status */}
      <div style={{ display: 'flex', gap: '1px', marginBottom: '20px' }}>
        {PROPERTIES.map(p => (
          <div key={p.id} style={{ flex: 1, background: '#242422', border: '0.5px solid #363634', padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: p.color, marginBottom: '2px' }}>{p.label}</div>
                <div style={{ fontSize: '11px', color: '#888880' }}>
                  {icalStatus[p.id] === 'loading' ? 'Syncing...' :
                   icalStatus[p.id] === 'done' ? 'Synced ✓' :
                   icalStatus[p.id] === 'error' ? 'Sync failed' :
                   'iCal connected'}
                </div>
              </div>
              <button
                onClick={() => refreshICal(p.id)}
                disabled={icalStatus[p.id] === 'loading'}
                style={{ padding: '4px 10px', background: '#363634', color: '#888880', border: 'none', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.08em', cursor: 'pointer' }}
              >
                Refresh
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* property filter + month nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '1px' }}>
          <button
            onClick={() => setSelectedProperty(null)}
            style={{ padding: '6px 14px', background: !selectedProperty ? '#F5F2EC' : '#363634', color: !selectedProperty ? '#242422' : '#AEAEA6', border: 'none', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            All
          </button>
          {PROPERTIES.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedProperty(selectedProperty === p.id ? null : p.id)}
              style={{ padding: '6px 14px', background: selectedProperty === p.id ? p.color : '#363634', color: selectedProperty === p.id ? '#242422' : '#AEAEA6', border: 'none', fontFamily: 'var(--sans)', fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} style={{ background: 'none', border: 'none', color: '#888880', fontSize: '18px', cursor: 'pointer' }}>←</button>
          <span style={{ fontFamily: 'var(--serif)', fontSize: '20px', fontWeight: 300, color: '#F5F2EC', minWidth: '160px', textAlign: 'center' }}>
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} style={{ background: 'none', border: 'none', color: '#888880', fontSize: '18px', cursor: 'pointer' }}>→</button>
        </div>
      </div>

      {/* calendar grid — one row per property */}
      {visibleProperties.map(prop => (
        <div key={prop.id} style={{ marginBottom: '2px' }}>
          <div style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '.14em', textTransform: 'uppercase', color: prop.color, padding: '8px 0 4px' }}>
            {prop.id === 'royal-york-east' ? 'Royal York East Suite' :
             prop.id === 'royal-york-west' ? 'Royal York West Suite' : 'Nickel Beach Retreat'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: '#363634' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} style={{ background: '#1E1E1C', padding: '4px 6px', fontSize: '9px', letterSpacing: '.1em', textTransform: 'uppercase', color: '#333330', textAlign: 'center' }}>{d}</div>
            ))}
            {paddedDays.map((day, i) => {
              if (!day) return <div key={`pad-${i}`} style={{ background: '#1E1E1C', minHeight: '56px' }} />
              const dayBookings = getBookingsForDay(day, prop.id)
              const dayBlocks = getBlocksForDay(day, prop.id)
              const isOccupied = dayBookings.length > 0
              const isBlocked = dayBlocks.length > 0
              const today = isToday(day)

              return (
                <div key={day.toISOString()} style={{
                  background: isOccupied ? '#0a1520' : isBlocked ? '#1f1a10' : '#242422',
                  minHeight: '56px', padding: '4px 6px',
                  borderTop: today ? `2px solid ${prop.color}` : '2px solid transparent',
                  position: 'relative',
                }}>
                  <div style={{ fontSize: '11px', color: today ? prop.color : isSameMonth(day, currentMonth) ? '#888880' : '#333330', marginBottom: '3px', fontWeight: today ? 600 : 400 }}>
                    {format(day, 'd')}
                  </div>
                  {dayBookings.map(b => (
                    <div key={b.id} style={{
                      fontSize: '9px', color: STATUS_COLORS[b.status] || '#888880',
                      letterSpacing: '.04em', lineHeight: 1.3, marginBottom: '1px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {(Array.isArray(b.guests) ? (b.guests as any[])[0] : b.guests as any)?.name || 'Guest'}
                    </div>
                  ))}
                  {dayBlocks.map(b => (
                    <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ fontSize: '9px', color: '#f39c12', letterSpacing: '.04em' }}>
                        {BLOCK_REASONS[b.reason]}
                      </div>
                      <button
                        onClick={() => handleRemoveBlock(b.id)}
                        style={{ background: 'none', border: 'none', color: '#9A9A92', fontSize: '10px', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                        title="Remove block"
                      >×</button>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* legend */}
      <div style={{ display: 'flex', gap: '20px', marginTop: '16px', flexWrap: 'wrap' }}>
        {[
          { color: '#2ecc71', label: 'Confirmed' },
          { color: '#3498db', label: 'Active' },
          { color: '#f39c12', label: 'Pending payment' },
          { color: '#f39c12', label: 'Blocked', border: true },
        ].map(({ color, label, border }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', background: border ? 'transparent' : color, border: border ? `1px solid ${color}` : 'none' }} />
            <span style={{ fontSize: '11px', color: '#9A9A92' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* edit block modal */}
      {editingBlock && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '32px', width: '460px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '22px', fontWeight: 300, color: '#F5F2EC', marginBottom: '20px' }}>
              {editingBlock.guest_name || BLOCK_REASONS[editingBlock.reason]}
            </div>
            <div style={{ fontSize: '11px', color: '#9A9A92', marginBottom: '20px' }}>
              {editingBlock.start_date} → {editingBlock.end_date} · {editingBlock.property_id === 'royal-york-east' ? 'Royal York East' : editingBlock.property_id === 'royal-york-west' ? 'Royal York West' : 'Nickel Beach'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { label: 'Guest name', key: 'guest_name', placeholder: 'e.g. Sarah Johnson', type: 'text' },
                { label: 'Platform', key: 'platform', placeholder: '', type: 'select', options: ['manual', 'airbnb', 'vrbo', 'houfy'] },
                { label: 'Notes', key: 'notes', placeholder: 'Internal notes', type: 'text' },
                { label: 'Guest notes', key: 'guest_notes', placeholder: 'Special requests, allergies, etc.', type: 'textarea' },
              ].map(({ label, key, placeholder, type, options }) => (
                <div key={key}>
                  <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>{label}</div>
                  {type === 'select' ? (
                    <select value={(editForm as any)[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none' }}>
                      {options!.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                    </select>
                  ) : type === 'textarea' ? (
                    <textarea value={(editForm as any)[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                      rows={3} placeholder={placeholder}
                      style={{ width: '100%', padding: '10px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' as const }} />
                  ) : (
                    <input type="text" value={(editForm as any)[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      style={{ width: '100%', padding: '10px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const }} />
                  )}
                </div>
              ))}

              {/* early check-in */}
              <div style={{ borderTop: '0.5px solid #363634', paddingTop: '14px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '10px' }}>Early check-in</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="time" value={editForm.early_checkin_time || ''}
                    onChange={e => setEditForm(f => ({ ...f, early_checkin_time: e.target.value }))}
                    style={{ padding: '8px 10px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none' }} />
                  {[{ val: true, label: 'Granted', color: '#2ecc71' }, { val: false, label: 'Denied', color: '#e74c3c' }].map(({ val, label, color }) => (
                    <button key={label} onClick={() => setEditForm(f => ({ ...f, early_checkin_granted: f.early_checkin_granted === val ? null : val }))}
                      style={{ padding: '6px 14px', background: editForm.early_checkin_granted === val ? color : '#363634', color: editForm.early_checkin_granted === val ? '#fff' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', letterSpacing: '.08em' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* late checkout */}
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '10px' }}>Late checkout</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="time" value={editForm.late_checkout_time || ''}
                    onChange={e => setEditForm(f => ({ ...f, late_checkout_time: e.target.value }))}
                    style={{ padding: '8px 10px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none' }} />
                  {[{ val: true, label: 'Granted', color: '#2ecc71' }, { val: false, label: 'Denied', color: '#e74c3c' }].map(({ val, label, color }) => (
                    <button key={label} onClick={() => setEditForm(f => ({ ...f, late_checkout_granted: f.late_checkout_granted === val ? null : val }))}
                      style={{ padding: '6px 14px', background: editForm.late_checkout_granted === val ? color : '#363634', color: editForm.late_checkout_granted === val ? '#fff' : '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', letterSpacing: '.08em' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
              <button onClick={() => setEditingBlock(null)}
                style={{ flex: 1, padding: '12px', background: '#363634', color: '#9A9A92', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                Cancel
              </button>
              <button onClick={handleSaveBlock} disabled={editSaving}
                style={{ flex: 1, padding: '12px', background: editSaving ? '#363634' : 'var(--amber)', color: editSaving ? '#9A9A92' : '#1A1A18', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500 }}>
                {editSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* block modal */}
      {showBlockModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#242422', border: '0.5px solid #363634', padding: '32px', width: '420px' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '24px', fontWeight: 300, color: '#F5F2EC', marginBottom: '24px' }}>Block dates.</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* property */}
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Property</div>
                <select
                  value={selectedProperty || 'royal-york-east'}
                  onChange={e => setSelectedProperty(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none' }}
                >
                  {PROPERTIES.map(p => (
                    <option key={p.id} value={p.id}>{p.id === 'royal-york-east' ? 'Royal York East' : p.id === 'royal-york-west' ? 'Royal York West' : 'Nickel Beach'}</option>
                  ))}
                </select>
              </div>

              {/* dates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  { label: 'Start date', value: blockStart, setter: setBlockStart },
                  { label: 'End date', value: blockEnd, setter: setBlockEnd },
                ].map(({ label, value, setter }) => (
                  <div key={label}>
                    <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>{label}</div>
                    <input type="date" value={value} onChange={e => setter(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                ))}
              </div>

              {/* reason */}
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Reason</div>
                <select value={blockReason} onChange={e => setBlockReason(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none' }}
                >
                  {Object.entries(BLOCK_REASONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>

              {/* notes */}
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>Notes (optional)</div>
                <input type="text" value={blockNotes} onChange={e => setBlockNotes(e.target.value)} placeholder="Internal note"
                  style={{ width: '100%', padding: '10px 12px', background: '#363634', border: '0.5px solid #4A4A48', color: '#F5F2EC', fontFamily: 'var(--sans)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '24px' }}>
              <button onClick={() => setShowBlockModal(false)} style={{ flex: 1, padding: '12px', background: '#363634', color: '#888880', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                Cancel
              </button>
              <button onClick={handleAddBlock} disabled={!blockStart || !blockEnd || saving}
                style={{ flex: 1, padding: '12px', background: saving ? '#363634' : 'var(--amber)', color: saving ? '#9A9A92' : '#242422', border: 'none', fontFamily: 'var(--sans)', fontSize: '11px', cursor: 'pointer', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 500 }}
              >
                {saving ? 'Saving...' : 'Block dates'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
