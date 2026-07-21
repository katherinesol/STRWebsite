import { createAdminClient } from '@/lib/supabase/server'

// Auth context passed to every tool so scoping is enforced server-side
export type HaussyCtx = { userId: string | null; role: string }

// Tool definitions Claude sees (schemas). Kept minimal + explicit.
export const TOOL_DEFS = [
  {
    name: 'get_reservations',
    description: 'Get upcoming, current, or recent reservations across properties. Use for questions about bookings, check-ins, check-outs, occupancy, and who is staying when.',
    input_schema: {
      type: 'object' as const,
      properties: {
        range: { type: 'string', enum: ['upcoming', 'current', 'past', 'all'], description: 'Which reservations to fetch' },
        property_id: { type: 'string', description: "Optional: 'royal-york-east', 'royal-york-west', or 'nickel-beach'" },
      },
      required: ['range'],
    },
  },
  {
    name: 'get_finances',
    description: 'Get financial summary: income, expenses, profit, HST. OWNER ONLY. Use for money/profit/expense/tax questions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        period: { type: 'string', enum: ['month', 'quarter', 'year', 'all'], description: 'Time period' },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_invoices',
    description: 'Get contractor/vendor invoices with their outstanding balances and payment status. OWNER ONLY. Use for questions about bills, invoices, what is owed to contractors, or invoice payment status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filter: { type: 'string', enum: ['outstanding', 'all', 'paid'], description: 'outstanding = has a balance owed' },
      },
      required: ['filter'],
    },
  },
  {
    name: 'get_upcoming_payments',
    description: 'Get planned (not-yet-paid) payments across all invoices, with due dates and amounts. OWNER ONLY. Use for questions about upcoming payments, what payments are due, or what needs to be paid and when.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_tasks',
    description: 'Get open or recent operational tasks (cleaning, maintenance, water delivery, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['open', 'done', 'all'], description: 'Task status filter' },
      },
      required: ['status'],
    },
  },
  {
    name: 'get_guests',
    description: 'Get guest information and contact details from bookings.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Optional name to search for' },
      },
      required: [],
    },
  },
]

// Execute a tool with role-scoping enforced HERE, server-side. Claude cannot bypass this.
export async function runTool(name: string, input: any, ctx: HaussyCtx): Promise<{ ok: boolean; data?: any; error?: string }> {
  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  try {
    switch (name) {
      case 'get_reservations': {
        // both owner and co-owner may see reservations
        let q = supabase.from('bookings').select('id, property_id, check_in, check_out, status, total, nights, guests, guest:guests(name, email, phone)')
        if (input.property_id) q = q.eq('property_id', input.property_id)
        if (input.range === 'upcoming') q = q.gte('check_in', today).order('check_in')
        else if (input.range === 'current') q = q.lte('check_in', today).gte('check_out', today)
        else if (input.range === 'past') q = q.lt('check_out', today).order('check_out', { ascending: false }).limit(50)
        else q = q.order('check_in', { ascending: false }).limit(50)
        const { data, error } = await q
        if (error) return { ok: false, error: error.message }
        return { ok: true, data }
      }

      case 'get_finances': {
        // ROLE GATE: co-owners get NO financial data
        if (ctx.role !== 'owner') {
          return { ok: false, error: 'Financial data is restricted to owners.' }
        }
        let start = '2000-01-01'
        const now = new Date()
        if (input.period === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
        else if (input.period === 'quarter') start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString().split('T')[0]
        else if (input.period === 'year') start = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]
        const { data: expenses } = await supabase.from('expenses').select('amount, hst_paid, category, date').gte('date', start)
        const totalExpenses = (expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0)
        const totalHst = (expenses || []).reduce((s, e) => s + (Number(e.hst_paid) || 0), 0)
        // income from bookings (accommodation) in period
        const { data: bookings } = await supabase.from('bookings').select('total, accommodation, cleaning_fee, hst, check_in, status').gte('check_in', start).neq('status', 'cancelled')
        const totalIncome = (bookings || []).reduce((s, b) => s + (Number(b.total) || 0), 0)
        const hstCollected = (bookings || []).reduce((s, b) => s + (Number(b.hst) || 0), 0)
        // expense breakdown by category
        const byCat: Record<string, number> = {}
        for (const e of (expenses || [])) { const c = e.category || 'Other'; byCat[c] = (byCat[c] || 0) + (Number(e.amount) || 0) }
        const topCategories = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([cat, amt]) => ({ category: cat, amount: Number(amt.toFixed(2)) }))
        return { ok: true, data: {
          period: input.period, since: start,
          totalIncome: Number(totalIncome.toFixed(2)),
          totalExpenses: Number(totalExpenses.toFixed(2)),
          netProfit: Number((totalIncome - totalExpenses).toFixed(2)),
          hstCollected: Number(hstCollected.toFixed(2)),
          hstPaid: Number(totalHst.toFixed(2)),
          netHstOwing: Number((hstCollected - totalHst).toFixed(2)),
          expenseCount: (expenses || []).length,
          topExpenseCategories: topCategories,
        } }
      }

      case 'get_invoices': {
        if (ctx.role !== 'owner') return { ok: false, error: 'Invoice data is restricted to owners.' }
        const { data: invoices } = await supabase.from('invoices').select('id, contractor_name, company, title, property_id, hst_amount')
        if (!invoices?.length) return { ok: true, data: [] }
        const ids = invoices.map(i => i.id)
        const [{ data: items }, { data: pays }] = await Promise.all([
          supabase.from('invoice_items').select('invoice_id, amount').in('invoice_id', ids),
          supabase.from('invoice_payments').select('invoice_id, amount, status').in('invoice_id', ids),
        ])
        const rows = invoices.map(inv => {
          const itemTotal = (items || []).filter(x => x.invoice_id === inv.id).reduce((s, x) => s + (Number(x.amount) || 0), 0)
          const hst = Number(inv.hst_amount) || 0
          const total = itemTotal + hst
          const paid = (pays || []).filter(x => x.invoice_id === inv.id && x.status === 'paid').reduce((s, x) => s + (Number(x.amount) || 0), 0)
          const outstanding = Number((total - paid).toFixed(2))
          return { vendor: inv.contractor_name || inv.company, title: inv.title, property_id: inv.property_id, total: Number(total.toFixed(2)), paid: Number(paid.toFixed(2)), outstanding }
        })
        const filtered = input.filter === 'outstanding' ? rows.filter(r => r.outstanding > 0.01)
          : input.filter === 'paid' ? rows.filter(r => r.outstanding <= 0.01) : rows
        return { ok: true, data: filtered }
      }

      case 'get_upcoming_payments': {
        if (ctx.role !== 'owner') return { ok: false, error: 'Payment data is restricted to owners.' }
        const { data: pays } = await supabase.from('invoice_payments').select('invoice_id, amount, due_date, method').eq('status', 'planned')
        if (!pays?.length) return { ok: true, data: [] }
        const invIds = Array.from(new Set(pays.map(p => p.invoice_id)))
        const { data: invoices } = await supabase.from('invoices').select('id, contractor_name, company, title, property_id').in('id', invIds)
        const invMap = new Map((invoices || []).map(i => [i.id, i]))
        const rows = pays.map(p => {
          const inv: any = invMap.get(p.invoice_id) || {}
          return { vendor: inv.contractor_name || inv.company || 'Unknown', title: inv.title, property_id: inv.property_id, amount: Number(p.amount), due: p.due_date === 'completion' || !p.due_date ? 'on completion' : p.due_date, method: p.method }
        })
        rows.sort((a, b) => (a.due === 'on completion' ? '9999' : a.due).localeCompare(b.due === 'on completion' ? '9999' : b.due))
        return { ok: true, data: rows }
      }

      case 'get_tasks': {
        // maintenance_tasks holds task definitions with cadence
        const { data, error } = await supabase.from('maintenance_tasks').select('id, title, description, property_id, type, cadence, priority, active').eq('active', true).limit(60)
        if (error) return { ok: false, error: error.message }
        return { ok: true, data }
      }

      case 'get_guests': {
        let q = supabase.from('guests').select('name, email, phone, returning_guest, notes')
        if (input.search) q = q.ilike('name', `%${input.search}%`)
        const { data, error } = await q.order('created_at', { ascending: false }).limit(40)
        if (error) return { ok: false, error: error.message }
        return { ok: true, data }
      }

      default:
        return { ok: false, error: `Unknown tool: ${name}` }
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Tool execution failed' }
  }
}
