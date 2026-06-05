'use client'
import { useState } from 'react'
import { Property } from '@/lib/properties'

export default function PropertyFAQ({ property }: { property: Property }) {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <div style={{
      borderTop: '0.5px solid var(--sand)',
      paddingTop: '40px', marginBottom: '48px',
    }}>
      <div style={{
        fontSize: '10px', fontWeight: 500, letterSpacing: '.16em',
        textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '8px',
      }}>
        FAQ
      </div>
      <h2 style={{
        fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300,
        color: 'var(--noir)', marginBottom: '24px',
      }}>
        Common questions.
      </h2>
      <div>
        {property.faq.map((item, i) => (
          <div key={i} style={{ borderBottom: '0.5px solid var(--sand)' }}>
            <button
              onClick={() => setOpen(open === i ? null : i)}
              style={{
                width: '100%', textAlign: 'left', padding: '16px 0',
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', background: 'none', border: 'none',
                cursor: 'pointer',
              }}
            >
              <span style={{
                fontSize: '14px', fontWeight: 500, color: 'var(--noir)',
              }}>
                {item.q}
              </span>
              <span style={{
                fontSize: '18px', color: 'var(--amber)',
                transform: open === i ? 'rotate(45deg)' : 'none',
                transition: 'transform .2s', flexShrink: 0, marginLeft: '12px',
              }}>
                +
              </span>
            </button>
            {open === i && (
              <div style={{
                fontSize: '13px', color: 'var(--muted)',
                lineHeight: 1.7, paddingBottom: '16px',
              }}>
                {item.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
