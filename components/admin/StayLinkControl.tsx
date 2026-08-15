'use client'
import { useState, useEffect } from 'react'

export default function StayLinkControl({ bookingId, bookingKind, propertyId, guestName, startDate, endDate }: {
  bookingId: string; bookingKind: string; propertyId: string; guestName?: string; startDate: string; endDate: string
}) {
  const [group, setGroup] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [swapped, setSwapped] = useState(false)
  const [candidates, setCandidates] = useState<any[]>([])
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  function loadGroup() {
    fetch(`/api/admin/stay-groups?booking_id=${bookingId}&booking_kind=${bookingKind}`)
      .then(r => r.json()).then(d => { setGroup(d.group || null); setMembers(d.ordered || d.members || []) }).catch(() => {})
  }
  useEffect(() => { loadGroup() }, [bookingId])

  async function loadCandidates() {
    setPicking(true)
    const d = await fetch(`/api/admin/stay-groups/candidates?property=${propertyId}&exclude=${bookingId}&near=${startDate}`).then(r => r.json()).catch(() => ({ candidates: [] }))
    setCandidates(d.candidates || [])
  }

  async function linkTo(originalId: string, originalKind: string) {
    setBusy(true); setMsg('')
    const d = await fetch('/api/admin/stay-groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ original_id: originalId, original_kind: originalKind, extension_id: bookingId, extension_kind: bookingKind, property_id: propertyId, guest_name: guestName }),
    }).then(r => r.json())
    setBusy(false)
    if (d.error) { setMsg(d.error); return }
    setMsg('Linked' + (d.code?.note ? ` · ${d.code.note}` : ''))
    setPicking(false); loadGroup()
  }

  async function setTax(memberId: string, field: string, value: string) {
    await fetch('/api/admin/stay-groups', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ member_id: memberId, [field]: value }) })
    loadGroup()
  }

  async function unlink() {
    if (!group) return
    setBusy(true)
    await fetch(`/api/admin/stay-groups?group_id=${group.id}`, { method: 'DELETE' })
    setBusy(false); setGroup(null); setMembers([]); setMsg('Unlinked')
  }

  return (
    <div style={{ background: '#1E1E1C', border: '0.5px solid #363634', borderRadius: '8px', padding: '14px 16px', marginTop: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', color: '#F0EDE6', fontWeight: 500 }}>Linked stay</span>
        {group && <button onClick={unlink} disabled={busy} style={{ fontSize: '10px', color: '#e57373', background: 'none', border: 'none', cursor: 'pointer' }}>Unlink</button>}
      </div>
      {!group ? (
        !picking ? (
          <div>
            <p style={{ fontSize: '11px', color: '#9A9A92', margin: '0 0 8px' }}>Is this an extension of another stay? Link them to share one door code and read as one occupancy.</p>
            <button onClick={loadCandidates} style={{ padding: '6px 12px', background: '#242422', color: '#c9a24a', border: '0.5px solid #4a3a1f', fontSize: '11px', cursor: 'pointer', borderRadius: '5px' }}>Link as extension…</button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: '11px', color: '#9A9A92', margin: '0 0 8px' }}>Which stay does this extend?</p>
            {candidates.length === 0 ? <p style={{ fontSize: '11px', color: '#666660' }}>No nearby bookings for this property.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {candidates.map((c: any) => (
                  <button key={c.id} onClick={() => linkTo(c.id, c.kind)} disabled={busy} style={{ textAlign: 'left', padding: '7px 10px', background: '#242422', color: '#F0EDE6', border: '0.5px solid #363634', fontSize: '12px', cursor: 'pointer', borderRadius: '5px' }}>
                    {c.guest_name || 'Guest'} · {c.start_date} → {c.end_date} <span style={{ color: '#888880' }}>({c.platform || 'direct'})</span>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setPicking(false)} style={{ marginTop: '8px', fontSize: '10px', color: '#9A9A92', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
          </div>
        )
      ) : (
        <div>
          {(() => {
            const range = members.length ? `${members[0]?.start} → ${members[members.length-1]?.end}` : ''
            return <p style={{ fontSize: '11px', color: '#7bc47b', margin: '0 0 10px' }}>Linked · {members.length} bookings, one continuous occupancy · {range}</p>
          })()}
          <div style={{ fontSize: '10px', color: '#9A9A92', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '.04em' }}>Tax treatment per portion</div>
          {members.map((m: any, idx: number) => {
            const role = swapped ? (m.auto_role === 'original' ? 'extension' : 'original') : (m.auto_role || m.role)
            const isOrig = role === 'original'
            return (
              <div key={m.id} style={{ background: '#242422', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: isOrig ? '#c9a24a' : '#7bc47b', background: isOrig ? '#2a2416' : '#16281a', padding: '2px 7px', borderRadius: '4px' }}>{isOrig ? 'ORIGINAL' : 'EXTENSION'}</span>
                  <span style={{ fontSize: '12px', color: '#F0EDE6' }}>{m.guest || 'Guest'} · {m.start} → {m.end}</span>
                  <span style={{ fontSize: '11px', color: '#888880' }}>{m.platform || 'direct'}</span>
                  {members.length === 2 && idx === 0 && <span onClick={() => setSwapped(s => !s)} style={{ fontSize: '10px', color: '#9A9A92', cursor: 'pointer', marginLeft: 'auto' }}>↔ swap</span>}
                </div>
                <div style={{ display: 'flex', gap: '14px', fontSize: '11px' }}>
                  <label style={{ color: '#9A9A92' }}>MAT
                    <select value={m.mat_treatment || 'include'} onChange={e => setTax(m.id, 'mat_treatment', e.target.value)} style={{ marginLeft: '4px', padding: '2px 6px', background: '#1E1E1C', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '11px', borderRadius: '4px' }}>
                      <option value="include">include</option><option value="exempt">exempt</option>
                    </select>
                  </label>
                  <label style={{ color: '#9A9A92' }}>HST
                    <select value={m.hst_treatment || 'include'} onChange={e => setTax(m.id, 'hst_treatment', e.target.value)} style={{ marginLeft: '4px', padding: '2px 6px', background: '#1E1E1C', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '11px', borderRadius: '4px' }}>
                      <option value="include">include</option><option value="exempt">exempt</option>
                    </select>
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {msg && <div style={{ fontSize: '11px', color: msg.includes('Linked') ? '#7bc47b' : '#e6a86a', marginTop: '8px' }}>{msg}</div>}
    </div>
  )
}
