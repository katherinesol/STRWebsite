'use client'
import { useState, useEffect } from 'react'
import { use } from 'react'

export default function InvoiceAck({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [acking, setAcking] = useState(false)

  function load() {
    fetch(`/api/invoice-ack/${token}`).then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }
  useEffect(() => { load() }, [token])

  async function acknowledge() {
    setAcking(true)
    await fetch(`/api/invoice-ack/${token}`, { method: 'POST' })
    load(); setAcking(false)
  }

  if (loading) return <div style={{ padding: '40px', color: '#9A9A92', fontFamily: 'sans-serif' }}>Loading…</div>
  if (data?.error) return <div style={{ padding: '40px', color: '#e74c3c', fontFamily: 'sans-serif' }}>Invoice not found.</div>

  return (
    <div style={{ minHeight: '100vh', background: '#1A1A18', color: '#F0EDE6', fontFamily: 'sans-serif', padding: '40px 20px' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div style={{ fontSize: '13px', color: '#B8956B', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: '8px' }}>Invoice</div>
        <h1 style={{ fontSize: '26px', fontWeight: 300, marginBottom: '4px' }}>{data.title}</h1>
        <div style={{ fontSize: '14px', color: '#9A9A92', marginBottom: '24px' }}>For {data.contractor_name}</div>

        <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '4px', padding: '20px', marginBottom: '20px' }}>
          {(data.items || []).map((it: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px' }}>
              <span>{it.description}</span><span>${Number(it.amount).toFixed(2)}</span>
            </div>
          ))}
          {(data.adjustments || []).map((a: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '14px', color: '#e67e22' }}>
              <span>Deduction — {a.description}</span><span>−${Number(a.amount).toFixed(2)}</span>
            </div>
          ))}
          <div style={{ borderTop: '0.5px solid #363634', marginTop: '10px', paddingTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#9A9A92' }}><span>Total</span><span>${data.total.toFixed(2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#9A9A92' }}><span>Paid</span><span>${data.paid.toFixed(2)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 600, marginTop: '6px' }}><span>Outstanding</span><span>${data.outstanding.toFixed(2)}</span></div>
          </div>
        </div>

        {data.acknowledged_at ? (
          <div style={{ textAlign: 'center', color: '#2ecc71', fontSize: '14px' }}>✓ Acknowledged on {new Date(data.acknowledged_at).toLocaleDateString()}</div>
        ) : (
          <button onClick={acknowledge} disabled={acking} style={{ width: '100%', padding: '14px', background: '#B8956B', color: '#1A1A18', border: 'none', fontSize: '13px', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: '4px' }}>
            {acking ? 'Confirming…' : 'Acknowledge receipt'}
          </button>
        )}
      </div>
    </div>
  )
}
