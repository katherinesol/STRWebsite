'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import NewInvoiceDialog from '@/components/admin/NewInvoiceDialog'
import { L, F, microLabel, cardStyle, money } from '@/lib/design-tokens'

const PROP_NAMES: Record<string, string> = {
  'royal-york': 'Royal York',
  'royal-york-west': 'Royal York West',
  'royal-york-east': 'Royal York East',
  'nickel-beach': 'Nickel Beach',
}
const propName = (p: string | null) => (p ? PROP_NAMES[p] || p : 'No property set')

const pill = (on: boolean): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: '99px', fontSize: '13px', cursor: 'pointer',
  background: on ? L.ink : L.card, color: on ? '#fff' : L.ink,
  border: on ? '1px solid transparent' : `1px solid ${L.line}`,
  fontWeight: on ? 600 : 400,
})

type Filter = 'all' | 'owing' | 'closed'

export default function InvoicesPage() {
  const [d, setD] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [creating, setCreating] = useState(false)

  const load = () => fetch('/api/admin/invoices-summary').then(r => r.json()).then(setD).catch(() => {})
  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  const t = d?.totals
  const showOwing = filter !== 'closed'
  const showClosed = filter !== 'owing'

  return (
    <div style={{ paddingTop: '24px' }}>
      {creating && <NewInvoiceDialog onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load() }} />}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '24px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <span style={{ fontFamily: F.serif, fontSize: '40px', lineHeight: 1 }}>Invoices</span>
          <span style={{ fontSize: '15px', color: L.inkBody }}>
            {loading ? 'Reading invoices…'
              : !t ? 'Could not load invoices.'
              : t.owingCount === 0 ? `Nothing outstanding. All ${t.closedCount} are closed.`
              : `${t.owingCount === 1 ? 'One invoice still has money owing on it' : `${t.owingCount} invoices still have money owing`}. The other ${t.closedCount} are closed.`}
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
          <span style={{ padding: '12px 18px', borderRadius: '10px', border: `1px solid ${L.line}`, background: L.card, fontSize: '14px', fontWeight: 600 }}>Export CSV</span>
          <button onClick={() => setCreating(true)} style={{ padding: '12px 20px', borderRadius: '10px', background: L.ink, color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: F.sans }}>New invoice</button>
        </div>
      </div>

      {t && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginBottom: '24px' }}>
            <div style={{ ...cardStyle, border: `1px solid ${t.owing > 0 ? L.redLine : L.line}`, padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={microLabel}>Still owing</span>
              <span style={{ fontFamily: F.serif, fontSize: '31px', lineHeight: 1.1, color: t.owing > 0 ? L.red : L.ink }}>{money(t.owing)}</span>
              <span style={{ fontSize: '12px', color: L.inkMuted }}>
                {t.owingCount === 0 ? 'nothing outstanding' : `${t.owingCount} invoice${t.owingCount === 1 ? '' : 's'}`}
              </span>
            </div>
            <div style={{ ...cardStyle, padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={microLabel}>Paid in {t.year}</span>
              <span style={{ fontFamily: F.serif, fontSize: '31px', lineHeight: 1.1 }}>{money(t.paidThisYear)}</span>
              <span style={{ fontSize: '12px', color: L.inkMuted }}>
                {t.contractors} contractors{t.scheduled > 0 ? ` · ${money(t.scheduled)} scheduled` : ''}
              </span>
            </div>
            <div style={{ ...cardStyle, padding: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <span style={microLabel}>Biggest job</span>
              <span style={{ fontFamily: F.serif, fontSize: '31px', lineHeight: 1.1 }}>{money(t.biggestJob?.total)}</span>
              <span style={{ fontSize: '12px', color: L.inkMuted }}>
                {t.biggestJob ? `${t.biggestJob.title} · ${t.biggestJob.contractor} · ${propName(t.biggestJob.property)}` : '—'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <button onClick={() => setFilter('all')} style={pill(filter === 'all')}>All {d.rows.length}</button>
            <button onClick={() => setFilter('owing')} style={pill(filter === 'owing')}>Owing {t.owingCount}</button>
            <button onClick={() => setFilter('closed')} style={pill(filter === 'closed')}>Closed {t.closedCount}</button>
            <span style={{ marginLeft: 'auto', fontSize: '13px', color: L.inkMuted }}>Sorted by amount</span>
          </div>

          {showOwing && d.owing.length > 0 && (
            <div style={{ ...cardStyle, border: `1px solid ${L.redLine}`, overflow: 'hidden', marginBottom: '14px' }}>
              <div style={{ padding: '10px 20px', background: 'oklch(0.985 0.015 30)', borderBottom: `1px solid ${L.lineSoft}`, display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <span style={{ ...microLabel, letterSpacing: '0.12em', color: 'oklch(0.48 0.13 28)' }}>Owing</span>
              </div>
              {d.owing.map((r: any) => (
                <Link key={r.id} href={`/keyholder/money/invoices/${r.id}`} style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.2fr 1.4fr 1.1fr 1fr', padding: '16px 20px', alignItems: 'center', gap: '12px', textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 600 }}>{r.title}</span>
                    <span style={{ fontSize: '12px', color: L.inkMuted }}>{r.contractor || r.company || 'No contractor'}</span>
                  </div>
                  <span style={{ fontSize: '13px', color: L.inkBody }}>{propName(r.property)}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ height: '6px', borderRadius: '99px', background: 'oklch(0.94 0.005 80)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', width: `${r.pct}%`, height: '100%', background: 'oklch(0.55 0.11 155)' }} />
                    </div>
                    <span style={{ fontFamily: F.mono, fontSize: '11px', color: L.inkMuted }}>{money(r.paid)} paid of {money(r.total)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{ fontSize: '13px', color: L.red, fontWeight: 600 }}>
                      {r.nextDue ? `Next due ${r.nextDue}` : `${r.paymentCount} payment${r.paymentCount === 1 ? '' : 's'} so far`}
                    </span>
                    {r.planned > 0 && (
                      <span style={{ fontSize: '11px', color: L.amber }}>{money(r.planned)} scheduled, not yet paid</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                    <span style={{ fontFamily: F.mono, fontSize: '17px', color: L.red }}>{money(r.balance)}</span>
                    <span style={{ fontSize: '12px', color: L.link, fontWeight: 600 }}>Record payment</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {showClosed && d.closed.length > 0 && (
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              <div style={{ padding: '10px 20px', background: L.cardAlt, borderBottom: `1px solid ${L.lineSoft}`, display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <span style={{ ...microLabel, letterSpacing: '0.12em', color: L.green }}>Closed</span>
                <span style={{ marginLeft: 'auto', fontFamily: F.mono, fontSize: '12px', color: L.inkMuted }}>
                  {d.closed.length} invoices · {money(d.closed.reduce((s: number, r: any) => s + r.paid, 0))} paid in full
                </span>
              </div>
              {d.closed.map((r: any) => (
                <Link key={r.id} href={`/keyholder/money/invoices/${r.id}`} style={{
                  textDecoration: 'none', color: 'inherit',
                  display: 'grid', gridTemplateColumns: '2.2fr 1.2fr 1.4fr 1.1fr 1fr',
                  padding: '13px 20px', borderBottom: `1px solid ${L.lineFaint}`, alignItems: 'center', gap: '12px', fontSize: '13px',
                  background: r.heldBack > 0 ? L.amberWash : 'transparent',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{r.title}</span>
                    <span style={{ fontSize: '12px', color: L.inkMuted }}>{r.contractor || r.company || '—'}</span>
                  </div>
                  <span style={{ color: L.inkBody }}>{propName(r.property)}</span>
                  <span style={{ color: L.inkBody }}>{r.category || '—'}</span>
                  <span style={{ color: r.heldBack > 0 ? L.amber : L.green }}>
                    {r.lastPaidAt ? `Paid ${String(r.lastPaidAt).slice(0, 10)}` : 'Paid'}
                    {r.heldBack > 0 && ` · ${money(r.heldBack)} held back`}
                  </span>
                  <span style={{ textAlign: 'right', fontFamily: F.mono, fontSize: '14px' }}>{money(r.total)}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
