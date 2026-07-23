'use client'
import { useState, useEffect } from 'react'

const PROP_NAMES: Record<string, string> = { 'royal-york-east': 'Royal York East', 'royal-york-west': 'Royal York West', 'nickel-beach': 'Nickel Beach Retreat' }
const RATES: Record<string, { hst: number; mat: number }> = {
  'nickel-beach': { hst: 0.13, mat: 0.04 },
  'royal-york-east': { hst: 0.13, mat: 0 },
  'royal-york-west': { hst: 0.13, mat: 0 },
}
const FLAG_TEXT: Record<string, string> = {
  'missing-amounts': 'No amounts recorded for this booking yet.',
  'no-tax-recorded': 'No tax recorded. If tax was never charged, it must be backed out of the payout.',
  'tax-not-split': 'Taxes are one lumped amount. GST/HST and MAT are not separated.',
}
const money = (v: any) => v === null || v === undefined || v === '' ? '—' : '$' + Number(v).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (v: number) => Math.round(v * 100) / 100

function Info({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} style={{ cursor: 'help', fontSize: '10px', color: '#8A8A82', marginLeft: '4px' }}>ⓘ</span>
      {show && <span style={{ position: 'absolute', bottom: '150%', left: '50%', transform: 'translateX(-50%)', background: '#0E0E0D', color: '#F0EDE6', border: '0.5px solid #4A4A48', borderRadius: '6px', padding: '8px 11px', fontSize: '11px', lineHeight: 1.45, width: '215px', zIndex: 50, textTransform: 'none', letterSpacing: 'normal', fontWeight: 400, boxShadow: '0 4px 14px rgba(0,0,0,.5)' }}>{text}</span>}
    </span>
  )
}

const GRID = '1.2fr .95fr .55fr .75fr .65fr .65fr .75fr .65fr .85fr'

export default function IncomePage() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [grouped, setGrouped] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [calcGross, setCalcGross] = useState('')
  const [lumpedTax, setLumpedTax] = useState('')

  function load() {
    fetch('/api/admin/income').then(r => r.json()).then(d => { if (d.rows) setRows(d.rows) }).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  function openEdit(r: any) {
    setEditId(editId === r.id ? null : r.id)
    setForm({ tax_note: r.tax_note ?? '', tax_collected: r.tax_collected ?? '', accommodation: r.accommodation ?? '', cleaning_fee: r.cleaning_fee ?? '', extras: r.extras ?? '', discount: r.discount ?? '', hst: r.hst ?? '', mat: r.mat ?? '', host_fee: r.host_fee ?? '', payout: r.payout ?? '' })
    const base = (Number(r.accommodation) || 0) + (Number(r.cleaning_fee) || 0) + (Number(r.extras) || 0) - (Number(r.discount) || 0)
    setCalcGross(base > 0 ? String(r2(base)) : (r.payout ?? ''))
    setLumpedTax(r.hst === null && r.mat === null && r.taxes_total ? String(r.taxes_total) : '')
    setTaxCollected(null); setShortMsg('')
  }
  async function save(r: any) {
    setSaving(true)
    await fetch('/api/admin/income/update', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, source: r.source, ...form }) })
    setSaving(false); setEditId(null); load()
  }
  // back out tax from a tax-inclusive gross amount
  function absorb(r: any) {
    const g = Number(calcGross); if (!g) return
    setForm((f: any) => ({ ...f, tax_collected: 0 }))
    const rate = RATES[r.property_id] || { hst: 0.13, mat: 0 }
    const combined = rate.hst + rate.mat
    const base = g / (1 + combined)
    setForm((f: any) => ({ ...f, hst: r2(base * rate.hst), mat: rate.mat ? r2(base * rate.mat) : '', tax_note: `No tax collected. Backed out of $${r2(g)} — absorbed $${r2(g - base)}.` }))
  }
  // tax added on top of a base amount
  function onTop(r: any) {
    const b = Number(calcGross); if (!b) return
    const rate = RATES[r.property_id] || { hst: 0.13, mat: 0 }
    setForm((f: any) => ({ ...f, hst: r2(b * rate.hst), mat: rate.mat ? r2(b * rate.mat) : '' }))
  }
  // split one lumped tax amount into HST / MAT proportionally
  function splitLumped(r: any) {
    const t = Number(lumpedTax); if (!t) return
    const rate = RATES[r.property_id] || { hst: 0.13, mat: 0 }
    const combined = rate.hst + rate.mat
    if (!combined) return
    setForm((f: any) => ({ ...f, hst: r2(t * (rate.hst / combined)), mat: rate.mat ? r2(t * (rate.mat / combined)) : '', tax_collected: r2(t), tax_note: `Split $${r2(t)} of collected tax into HST and MAT.` }))
  }
  // wrong rate charged on top of the base — you absorb the shortfall
  const [chargedPct, setChargedPct] = useState('')
  function shortfall(r: any) {
    const base = Number(calcGross); const charged = Number(chargedPct)
    if (!base || isNaN(charged)) return
    const rate = RATES[r.property_id] || { hst: 0.13, mat: 0 }
    const owed = base * rate.hst
    const collected = base * (charged / 100)
    setForm((f: any) => ({ ...f, hst: r2(owed), mat: rate.mat ? r2(base * rate.mat) : '', tax_collected: r2(collected), tax_note: `Undertaxed: charged ${charged}% instead of ${rate.hst * 100}%. Collected $${r2(collected)}, absorbed $${r2(owed - collected)}.` }))
    setShortMsg(`On a base of $${r2(base)}: HST owed $${r2(owed)}, you collected $${r2(collected)} at ${charged}%, so you absorb $${r2(owed - collected)}. Payout below uses the $${r2(collected)} actually deposited.`)
  }
  const [shortMsg, setShortMsg] = useState('')
  const [taxCollected, setTaxCollected] = useState<number | null>(null)

  function computedPayout() {
    const f = form
    const base = (Number(f.accommodation) || 0) + (Number(f.cleaning_fee) || 0) + (Number(f.extras) || 0) - (Number(f.discount) || 0)
    const taxInPayout = f.tax_collected === '' || f.tax_collected === null || f.tax_collected === undefined
      ? (Number(f.hst) || 0) + (Number(f.mat) || 0)
      : Number(f.tax_collected) || 0
    return r2(base - (Number(f.host_fee) || 0) + taxInPayout)
  }

  const sum = (list: any[], k: string) => list.reduce((s, x) => s + (Number(x[k]) || 0), 0)
  const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', background: '#1E1E1C', border: '0.5px solid #4A4A48', color: '#F0EDE6', fontSize: '12px', borderRadius: '4px', boxSizing: 'border-box' }

  const Header = () => (
    <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '8px', padding: '8px 14px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.1em', color: '#666660', borderBottom: '0.5px solid #363634' }}>
      <span>Guest</span><span>Dates</span><span>Source</span>
      <span>Accom.<Info text="Room revenue before fees and taxes." /></span>
      <span>Cleaning</span>
      <span>Discount<Info text="Reduces the taxable base. Airbnb calculates tax and host fees on the amount after discount." /></span>
      <span>Taxes<Info text="Tax collected from the guest. Nickel Beach: 13% HST + 4% MAT. Royal York: 13% HST (Airbnb remits Toronto MAT)." /></span>
      <span>Host fee<Info text="Platform commission charged to you — a deductible expense." /></span>
      <span style={{ textAlign: 'right' }}>Payout<Info text="What lands in your account after platform fees." /></span>
    </div>
  )

  const Row = ({ r }: { r: any }) => (
    <div key={r.id}>
      <div onClick={() => openEdit(r)} style={{ display: 'grid', gridTemplateColumns: GRID, gap: '8px', padding: '11px 14px', fontSize: '12px', color: '#AEAEA6', borderBottom: '0.5px solid #2A2A28', alignItems: 'center', cursor: 'pointer', background: editId === r.id ? '#2A2A28' : 'transparent' }}>
        <span style={{ color: '#F0EDE6' }}>{r.guest_name}{r.flags.length > 0 && <Info text={r.flags.map((f: string) => FLAG_TEXT[f]).join(' ')} />}{r.flags.length > 0 && <span style={{ marginLeft: '3px' }}>⚠️</span>}</span>
        <span style={{ fontSize: '11px' }}>{r.check_in} → {r.check_out}{r.tax_note ? <span style={{ display: 'block', fontSize: '9px', color: '#8A7A5A', marginTop: '2px' }}>{r.tax_note}</span> : null}</span>
        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: r.source === 'direct' ? 'var(--amber)' : '#9A9A92' }}>{r.platform}</span>
        <span>{money(r.accommodation)}</span><span>{money(r.cleaning_fee)}</span>
        <span>{r.discount ? '-' + money(r.discount).slice(1) : '—'}</span>
        <span>{money(r.taxes_total)}</span><span>{money(r.host_fee)}</span>
        <span style={{ textAlign: 'right', color: '#F0EDE6' }}>{money(r.payout)}</span>
      </div>
      {editId === r.id && (
        <div style={{ padding: '16px', background: '#1E1E1C', borderBottom: '0.5px solid #2A2A28' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--amber)', marginBottom: '10px' }}>Fix this booking</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
            {([['accommodation','Accommodation'],['cleaning_fee','Cleaning'],['extras','Extras (pet fee etc)'],['discount','Discount'],['host_fee','Host service fee'],['tax_collected','Tax Airbnb collected'],['hst','HST / GST (13%)'],...(RATES[r.property_id]?.mat ? [['mat','MAT (4%)']] : []),['payout','Payout received']] as string[][]).map(([k, label]) => (
              <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '9px', color: '#9A9A92', textTransform: 'uppercase' }}>{label}</span>
                <input value={form[k] ?? ''} onChange={e => setForm((f: any) => ({ ...f, [k]: e.target.value }))} style={inp} />
              </label>
            ))}
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '14px' }}>
            <span style={{ fontSize: '9px', color: '#9A9A92', textTransform: 'uppercase' }}>Note — why the numbers differ</span>
            <input value={form.tax_note ?? ''} onChange={e => setForm((f: any) => ({ ...f, tax_note: e.target.value }))} placeholder="Filled automatically by the calculator" style={inp} />
          </label>

          {Math.abs((Number(form.payout) || 0) - computedPayout()) > 0.02 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: '#e6a86a' }}>These figures give a payout of <span style={{ color: '#F0EDE6' }}>{money(computedPayout())}</span></span>
              <button onClick={() => setForm((f: any) => ({ ...f, payout: computedPayout() }))} style={{ padding: '5px 11px', background: '#363634', color: '#F0EDE6', border: 'none', fontSize: '10px', cursor: 'pointer', borderRadius: '5px' }}>Use this</button>
            </div>
          )}

          <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '6px', padding: '14px', marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', color: '#F0EDE6', marginBottom: '3px' }}>Look at this booking on Airbnb. Does it show a tax line?</div>
            <div style={{ fontSize: '10px', color: '#666660', marginBottom: '12px' }}>{PROP_NAMES[r.property_id]} — {(RATES[r.property_id]?.hst ?? 0) * 100}% HST{RATES[r.property_id]?.mat ? ` + ${RATES[r.property_id].mat * 100}% MAT (both yours to remit)` : ' (Airbnb handles Toronto MAT)'}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ borderLeft: '2px solid #4A4A48', paddingLeft: '10px' }}>
                <div style={{ fontSize: '11px', color: '#F0EDE6', marginBottom: '5px' }}>No tax line at all — nothing was collected</div>
                <div style={{ fontSize: '10px', color: '#8A8A82', marginBottom: '6px' }}>Tax is buried in what you received. Enter the taxable base (pre-filled below), then:</div>
                <button onClick={() => absorb(r)} style={{ padding: '7px 12px', background: '#363634', color: '#F0EDE6', border: 'none', fontSize: '11px', cursor: 'pointer', borderRadius: '5px' }}>Take tax out of that amount</button>
              </div>

              <div style={{ borderLeft: '2px solid #4A4A48', paddingLeft: '10px' }}>
                <div style={{ fontSize: '11px', color: '#F0EDE6', marginBottom: '5px' }}>Tax line shown, but at the wrong rate</div>
                <div style={{ fontSize: '10px', color: '#8A8A82', marginBottom: '6px' }}>Enter the base below, plus the rate you actually charged. You absorb the shortfall.</div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input value={chargedPct} onChange={e => setChargedPct(e.target.value)} placeholder="rate charged, e.g. 11" style={{ ...inp, width: '150px' }} />
                  <button onClick={() => shortfall(r)} style={{ padding: '7px 12px', background: '#363634', color: '#F0EDE6', border: 'none', fontSize: '11px', cursor: 'pointer', borderRadius: '5px' }}>Work out what I absorb</button>
                </div>
              </div>

              {RATES[r.property_id]?.mat ? (
                <div style={{ borderLeft: '2px solid #4A4A48', paddingLeft: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#F0EDE6', marginBottom: '5px' }}>One combined tax line (HST and MAT together)</div>
                  <div style={{ fontSize: '10px', color: '#8A8A82', marginBottom: '6px' }}>Enter the tax figure from the booking and it splits 13/17 to HST, 4/17 to MAT.</div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input value={lumpedTax} onChange={e => setLumpedTax(e.target.value)} placeholder="total taxes, e.g. 564.23" style={{ ...inp, width: '170px' }} />
                    <button onClick={() => splitLumped(r)} style={{ padding: '7px 12px', background: '#363634', color: '#F0EDE6', border: 'none', fontSize: '11px', cursor: 'pointer', borderRadius: '5px' }}>Split into HST and MAT</button>
                  </div>
                </div>
              ) : null}

              <div style={{ borderLeft: '2px solid #4A4A48', paddingLeft: '10px' }}>
                <div style={{ fontSize: '11px', color: '#F0EDE6', marginBottom: '5px' }}>Tax line is already correct</div>
                <div style={{ fontSize: '10px', color: '#8A8A82', marginBottom: '6px' }}>Skip the calculator — type the figures straight into the fields above. Or work them out from the base:</div>
                <button onClick={() => onTop(r)} style={{ padding: '7px 12px', background: '#363634', color: '#F0EDE6', border: 'none', fontSize: '11px', cursor: 'pointer', borderRadius: '5px' }}>Calculate tax on the base</button>
              </div>
            </div>

            <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '0.5px solid #363634' }}>
              <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.1em', color: '#9A9A92', marginBottom: '5px' }}>Amount the buttons use</div>
              <input value={calcGross} onChange={e => setCalcGross(e.target.value)} style={{ ...inp, width: '160px' }} />
              <div style={{ fontSize: '10px', color: '#666660', marginTop: '6px', lineHeight: 1.5 }}>Pre-filled with the taxable base: accommodation + cleaning + extras (pet fee etc), less discount. Not your payout — the host service fee doesn't reduce it.</div>
            </div>

            {shortMsg && <div style={{ fontSize: '11px', color: '#e6c88a', marginTop: '10px', lineHeight: 1.5 }}>{shortMsg}</div>}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => save(r)} disabled={saving} style={{ padding: '8px 18px', background: 'var(--amber)', color: '#242422', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '6px' }}>{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setEditId(null)} style={{ padding: '8px 16px', background: '#363634', color: '#9A9A92', border: 'none', fontSize: '12px', cursor: 'pointer', borderRadius: '6px' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )

  const Totals = ({ list }: { list: any[] }) => (
    <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '8px', padding: '11px 14px', fontSize: '12px', color: 'var(--amber)', borderTop: '0.5px solid #363634', fontWeight: 600 }}>
      <span>{list.length} booking{list.length === 1 ? '' : 's'}</span><span /><span />
      <span>{money(sum(list, 'accommodation'))}</span><span>{money(sum(list, 'cleaning_fee'))}</span>
      <span>{money(sum(list, 'discount'))}</span>
      <span>{money(sum(list, 'taxes_total'))}</span><span>{money(sum(list, 'host_fee'))}</span>
      <span style={{ textAlign: 'right' }}>{money(sum(list, 'payout'))}</span>
    </div>
  )

  const flagged = rows.filter(r => r.flags.length > 0).length
  const props = Array.from(new Set(rows.map(r => r.property_id)))

  return (
    <div style={{ maxWidth: '1150px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '18px' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 300, fontSize: '30px', color: '#F0EDE6', margin: 0 }}>Income</h1>
          <p style={{ fontSize: '12px', color: '#9A9A92', marginTop: '2px' }}>Click any booking to fix its amounts.{flagged > 0 && <span style={{ color: '#e6a86a' }}> · {flagged} need attention ⚠️</span>}</p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {[['Grouped', true], ['Flat', false]].map(([label, val]) => (
            <button key={String(label)} onClick={() => setGrouped(val as boolean)} style={{ padding: '7px 14px', background: grouped === val ? 'var(--amber)' : '#242422', color: grouped === val ? '#242422' : '#AEAEA6', border: '0.5px solid #363634', borderRadius: '6px', fontSize: '12px', fontWeight: grouped === val ? 600 : 400, cursor: 'pointer' }}>{label as string}</button>
          ))}
        </div>
      </div>

      {loading && <div style={{ color: '#666660', fontSize: '13px' }}>Loading…</div>}

      {!loading && grouped && props.map(pid => {
        const list = rows.filter(r => r.property_id === pid)
        return (
          <div key={pid} style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '6px', marginBottom: '18px', overflowX: 'auto' }}>
            <div style={{ padding: '13px 14px', fontSize: '13px', color: '#F0EDE6', borderBottom: '0.5px solid #363634' }}>{PROP_NAMES[pid] || pid}</div>
            <div style={{ minWidth: '860px' }}><Header />{list.map(r => Row({ r }))}<Totals list={list} /></div>
          </div>
        )
      })}

      {!loading && !grouped && (
        <div style={{ background: '#242422', border: '0.5px solid #363634', borderRadius: '6px', overflowX: 'auto' }}>
          <div style={{ minWidth: '860px' }}><Header />{rows.map(r => Row({ r }))}<Totals list={rows} /></div>
        </div>
      )}
    </div>
  )
}
