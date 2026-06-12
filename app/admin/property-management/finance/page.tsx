import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import ExpensesManager from '@/components/admin/ExpensesManager'

export default async function FinancePage() {
  const supabase = createAdminClient()

  const [{ data: expenses }, { data: directBookings }, { data: platformBookings }] = await Promise.all([
    supabase.from('expenses').select('*').order('date', { ascending: false }).limit(200),
    supabase.from('bookings').select('total, property_id, check_in, status').in('status', ['confirmed', 'active', 'completed']),
    supabase.from('calendar_blocks').select('payout_amount, amount_paid, taxes_collected, property_id, start_date, is_booking').eq('is_booking', true).not('payout_amount', 'is', null),
  ])

  const vendors = [...new Set((expenses || []).map(e => e.vendor).filter(Boolean))]

  // generate signed URLs for receipts (private bucket, 1hr expiry)
  const expensesWithReceipts = await Promise.all((expenses || []).map(async (e) => {
    if (!e.receipt_path) return { ...e, signed_receipt_url: null }
    const { data: signed } = await supabase.storage
      .from('property-management')
      .createSignedUrl(e.receipt_path, 3600)
    return { ...e, signed_receipt_url: signed?.signedUrl || null }
  }))

  // income totals
  const directIncome = (directBookings || []).reduce((s, b) => s + (b.total || 0), 0)
  const platformIncome = (platformBookings || []).reduce((s, b) => s + (b.payout_amount || b.amount_paid || 0), 0)
  const totalIncome = directIncome + platformIncome

  // expense totals
  const totalExpenses = (expenses || []).reduce((s, e) => s + (e.amount || 0), 0)
  const totalHstPaid = (expenses || []).reduce((s, e) => s + (e.hst_paid || 0), 0)
  const netProfit = totalIncome - totalExpenses

  // taxes collected by platforms (HST remitted on your behalf or owed)
  const taxesCollected = (platformBookings || []).reduce((s, b) => s + (b.taxes_collected || 0), 0)

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/admin/property-management" style={{ fontSize: '11px', color: '#9A9A92', textDecoration: 'none' }}>← Property mgmt</Link>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: '28px', fontWeight: 300, color: '#F5F2EC', marginTop: '8px' }}>Finance.</h1>
      </div>

      {/* P&L summary */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: '#363634', marginBottom: '24px' }}>
        {[
          { label: 'Total income', value: `$${totalIncome.toFixed(2)}`, color: '#2ecc71', sub: `Direct $${directIncome.toFixed(0)} · Platform $${platformIncome.toFixed(0)}` },
          { label: 'Total expenses', value: `$${totalExpenses.toFixed(2)}`, color: '#e74c3c', sub: `HST paid $${totalHstPaid.toFixed(2)}` },
          { label: 'Net profit', value: `$${netProfit.toFixed(2)}`, color: netProfit >= 0 ? '#2ecc71' : '#e74c3c', sub: `${totalIncome > 0 ? ((netProfit/totalIncome)*100).toFixed(0) : 0}% margin` },
          { label: 'HST collected', value: `$${taxesCollected.toFixed(2)}`, color: '#9A9A92', sub: `ITC available: $${totalHstPaid.toFixed(2)} · Net: $${(taxesCollected - totalHstPaid).toFixed(2)}` },
        ].map(({ label, value, color, sub }) => (
          <div key={label} style={{ background: '#242422', padding: '20px 24px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#9A9A92', marginBottom: '6px' }}>{label}</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: '24px', fontWeight: 300, color }}>{value}</div>
            <div style={{ fontSize: '11px', color: '#555550', marginTop: '4px' }}>{sub}</div>
          </div>
        ))}
      </div>

      <ExpensesManager expenses={expensesWithReceipts} vendors={vendors} />
    </div>
  )
}
