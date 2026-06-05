'use client'
import { useState } from 'react'

export default function Newsletter() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setSubmitted(true)
  }

  return (
    <div style={{
      background: 'var(--sand)', padding: 'clamp(40px, 6vw, 64px) clamp(20px, 5vw, 40px)',
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '48px', alignItems: 'center',
    }}>
      <div>
        <h3 style={{
          fontFamily: 'var(--serif)', fontSize: '30px', fontWeight: 300,
          letterSpacing: '-.01em', color: 'var(--noir)', marginBottom: '8px',
        }}>
          Stay in the <em>loop.</em>
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6 }}>
          Property updates, seasonal offers, and things worth knowing — sent once a year, no more.
        </p>
      </div>
      <div>
        {submitted ? (
          <div style={{
            fontSize: '13px', color: 'var(--noir)',
            fontFamily: 'var(--serif)', fontStyle: 'italic',
          }}>
            You're on the list. We'll be in touch.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex' }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Your email address"
              style={{
                flex: 1, padding: '13px 16px', fontFamily: 'var(--sans)',
                fontSize: '13px', border: '0.5px solid var(--sand-mid)',
                borderRight: 'none', borderRadius: '2px 0 0 2px',
                background: 'white', color: 'var(--noir)', outline: 'none',
              }}
            />
            <button type="submit" style={{
              padding: '13px 24px', background: 'var(--noir)', color: 'var(--chalk)',
              fontSize: '11px', letterSpacing: '.1em', textTransform: 'uppercase',
              border: 'none', borderRadius: '0 2px 2px 0',
            }}>
              Subscribe
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
