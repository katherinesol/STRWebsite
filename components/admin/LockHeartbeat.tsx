'use client'
import { useEffect, useState } from 'react'

/*  Whether the door machinery is alive, above the list of doors.
 *
 *  It sits at the top because of what happened between 10 and 24 September: the
 *  worker's Schlage password expired, every run died at the login before any
 *  phase, and twelve intents accumulated for a fortnight. One guest's code was
 *  never programmed. The page below this showed nothing wrong, because it
 *  described bookings rather than the machine that serves them.
 *
 *  It leads with LAST SUCCESSFUL DRAIN rather than any measure of the worker
 *  having run. Those two figures were fourteen days apart, and the gap was the
 *  whole bug. */

const ago = (t: string | null) => {
  if (!t) return 'never'
  const h = (Date.now() - new Date(t).getTime()) / 3600000
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`
  if (h < 48) return `${Math.round(h)} h ago`
  return `${Math.floor(h / 24)} days ago`
}
const box: React.CSSProperties = {
  background: '#242422', border: '0.5px solid #363634', borderRadius: '6px', padding: '12px 14px', flex: 1, minWidth: '150px',
}
const lbl: React.CSSProperties = {
  fontSize: '9px', letterSpacing: '.14em', textTransform: 'uppercase', color: '#666660', marginBottom: '5px',
}

export default function LockHeartbeat() {
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch('/api/admin/locks/heartbeat')
      .then(r => r.json())
      .then(j => j.error ? setErr(j.error) : setD(j))
      .catch(() => setErr('The heartbeat could not be read'))
  }, [])

  if (err) return <div style={{ ...box, color: '#e6a86a', marginBottom: '18px' }}>{err}</div>
  if (!d) return null

  const w = d.worker, q = d.queue
  const signInTone = w.sign_in_ok === false ? '#e57373' : w.sign_in_ok ? '#7bc47b' : '#9a9aa2'
  const drainTone = q.hours_since_drain === null ? '#9a9aa2'
    : q.hours_since_drain > 48 && q.pending ? '#e57373'
    : q.hours_since_drain > 48 ? '#e6a86a' : '#7bc47b'

  return (
    <div style={{ marginBottom: '18px' }}>
      {d.alarms.map((a: string, i: number) => (
        <div key={i} style={{ background: '#3a1f1f', border: '0.5px solid #5a2f2f', borderRadius: '6px', padding: '11px 14px', marginBottom: '8px', fontSize: '12.5px', color: '#e57373', lineHeight: 1.55 }}>
          {a}
        </div>
      ))}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <div style={box}>
          {/* the figure the stall was invisible in */}
          <div style={lbl}>Last successful drain</div>
          <div style={{ fontSize: '15px', color: drainTone }}>{ago(q.last_successful_drain)}</div>
        </div>
        <div style={box}>
          {/*  Not "sign-in": the same lock.auth record now also carries a
               refusal to run at all, when this Mac's copy has drifted from the
               repo. Both are "the worker did no work", which is what matters. */}
          <div style={lbl}>Worker</div>
          <div style={{ fontSize: '15px', color: signInTone }}>
            {w.sign_in_ok === false
              ? (w.stage === 'version' ? 'out of date' : 'cannot sign in')
              : w.sign_in_ok ? 'ok' : 'never recorded'}
          </div>
          <div style={{ fontSize: '10.5px', color: '#666660', marginTop: '3px' }}>{ago(w.last_sign_in)}</div>
        </div>
        <div style={box}>
          <div style={lbl}>Waiting to be programmed</div>
          <div style={{ fontSize: '15px', color: q.pending ? '#e6a86a' : '#7bc47b' }}>
            {q.pending} intent{q.pending === 1 ? '' : 's'}
          </div>
          {q.oldest_pending && (
            <div style={{ fontSize: '10.5px', color: '#666660', marginTop: '3px' }}>
              oldest {q.oldest_pending.age_days}d · for {q.oldest_pending.stay_start || '?'}
            </div>
          )}
        </div>
        <div style={box}>
          <div style={lbl}>Per door</div>
          <div style={{ fontSize: '11.5px', color: '#AEAEA6', lineHeight: 1.6 }}>
            {q.per_device.length
              ? q.per_device.map((p: any) => <div key={p.lock}>{p.lock}: {p.pending}</div>)
              : <span style={{ color: '#7bc47b' }}>nothing queued</span>}
          </div>
        </div>
      </div>

      {/*  The roster. Written by the worker each run from the lock itself, so an
           age here is also a statement about whether the worker is running. */}
      {d.batteries?.length > 0 && (
        <div style={{ ...box, marginTop: '8px', flex: 'unset' }}>
          <div style={lbl}>Batteries</div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {d.batteries.map((b: any) => (
              <span key={b.lock} style={{ fontSize: '12.5px', color: '#AEAEA6' }}>
                {b.lock}{' '}
                <span style={{
                  fontFamily: 'monospace',
                  color: b.level === null ? '#666660' : b.level <= 25 ? '#e57373' : b.level <= 40 ? '#e6a86a' : '#7bc47b',
                }}>
                  {b.level === null ? 'not read yet' : `${b.level}%`}
                </span>
                {b.level !== null && b.stale && (
                  <span style={{ color: '#666660', fontSize: '11px' }}> · {ago(b.checked_at)}</span>
                )}
              </span>
            ))}
          </div>
          {d.batteries.every((b: any) => b.level === null) && (
            <div style={{ fontSize: '11px', color: '#666660', marginTop: '6px' }}>
              The worker fills these on its next run with --commit.
            </div>
          )}
        </div>
      )}

      {q.pending > 0 && (
        <div style={{ fontSize: '11px', color: '#666660', marginTop: '8px', lineHeight: 1.6 }}>
          The worker writes one code per door per run, so a queue this deep needs several runs — that pacing is deliberate,
          Royal Side rejects rapid writes. Depth alone is not a fault; a stay that has already started is.
        </div>
      )}
    </div>
  )
}
