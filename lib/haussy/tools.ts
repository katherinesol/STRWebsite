import { createAdminClient } from '@/lib/supabase/server'

export type HaussyCtx = { userId: string | null; role: string }

// ALLOWLIST: the only tables Haussy can read. Everything else (auth, secrets, system, haussy's own logs) is unreachable.
// Each entry notes whether it's financially sensitive (owner-only).
const TABLE_ALLOWLIST: Record<string, { desc: string; ownerOnly?: boolean }> = {
  bookings:            { desc: 'Direct reservations (your own booking site)' },
  calendar_blocks:     { desc: 'Airbnb/VRBO/platform bookings and owner date-blocks' },
  guests:              { desc: 'Guest contacts and profiles' },
  invoices:            { desc: 'Contractor/vendor invoices', ownerOnly: true },
  invoice_items:       { desc: 'Line items on invoices', ownerOnly: true },
  invoice_adjustments: { desc: 'Discounts/adjustments on invoices', ownerOnly: true },
  invoice_payments:    { desc: 'Payments (paid + planned) on invoices', ownerOnly: true },
  expenses:            { desc: 'Business expenses and receipts', ownerOnly: true },
  maintenance_tasks:   { desc: 'Maintenance and operational task definitions' },
  water_orders:        { desc: 'Water delivery orders (Nickel Beach cistern)' },
  knowledge_base:      { desc: 'Guest knowledge base entries (house manuals)' },
  conversations:       { desc: 'Guest message threads (inbox)' },
  messages:            { desc: 'Individual messages within conversations' },
  guest_questions:     { desc: 'Questions guests asked the bot' },
  cistern_readings:    { desc: 'Water cistern level readings over time' },
  referrals:           { desc: 'Guest referrals' },
  reviews:             { desc: 'Guest reviews' },
}

// A single, safe, read-only query tool. Claude picks a table + simple filters; the server builds the query.
export const TOOL_DEFS = [
  {
    name: 'propose_task',
    description: `Propose a task or reminder for the owner. This does NOT create anything — it shows them a card to confirm. Use whenever they ask to be reminded of something, or to set up a recurring obligation. Work out the due date yourself from today's date. For recurring things, set cadence and use the NEXT occurrence as due_date.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Short title, e.g. "File Q3 MAT return"' },
        description: { type: 'string', description: 'What needs doing, including any figures or steps they will need' },
        due_date: { type: 'string', description: 'YYYY-MM-DD' },
        cadence: { type: 'string', description: 'e.g. quarterly, monthly, annual — omit for one-off' },
        property_id: { type: 'string', enum: ['royal-york-east', 'royal-york-west', 'nickel-beach'], description: 'Omit if it is not property-specific' },
        priority: { type: 'string', enum: ['low', 'normal', 'high'] },
      },
      required: ['title'],
    },
  },
  {
    name: 'mat_report',
    description: 'Municipal Accommodation Tax owed for Nickel Beach for a quarter. 4% on accommodation only, platform bookings only, stays over 29 nights exempt. Returns a monthly breakdown as ORHMA requires, plus per-booking detail. Quarters are due the 15th of the month after quarter end.',
    input_schema: {
      type: 'object' as const,
      properties: {
        year: { type: 'number' },
        quarter: { type: 'string', enum: ['Q1', 'Q2', 'Q3', 'Q4'] },
      },
      required: ['year', 'quarter'],
    },
  },
  {
    name: 'search_inventory',
    description: 'Search items the host has bought, extracted from receipts. Use for questions like "what plates do we use", "where did we get the coffee maker", "what did the towels cost". Returns matching items with price, store, date, property, and whether a receipt is on file.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'What to look for, e.g. "plates", "coffee", "towels"' },
        property_id: { type: 'string', enum: ['royal-york-east', 'royal-york-west', 'nickel-beach'], description: 'Optional — limit to one property' },
      },
      required: ['query'],
    },
  },
  {
    name: 'query_data',
    description: `Read the owner's business data to answer questions. Available tables:
${Object.entries(TABLE_ALLOWLIST).map(([t, m]) => `- ${t}: ${m.desc}${m.ownerOnly ? ' (owner only)' : ''}`).join('\n')}

Notes:
- Reservations are split across TWO tables: "bookings" (direct) AND "calendar_blocks" (Airbnb/VRBO). To answer "who's checking in", query BOTH. In calendar_blocks, check-in is start_date, check-out is end_date; rows where reason='owner' or block_for is set are owner date-blocks, not guests.
- You may call this multiple times in one turn (e.g. once per table) to gather everything you need.
- Dates are ISO (YYYY-MM-DD).`,
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', enum: Object.keys(TABLE_ALLOWLIST), description: 'Which table to read' },
        filters: {
          type: 'array',
          description: 'Optional filters, ANDed together',
          items: {
            type: 'object',
            properties: {
              column: { type: 'string' },
              op: { type: 'string', enum: ['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'ilike'] },
              value: { type: 'string' },
            },
            required: ['column', 'op', 'value'],
          },
        },
        order_by: { type: 'string', description: 'Optional column to sort by' },
        order_dir: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction' },
        limit: { type: 'number', description: 'Max rows (default 100, hard cap 200)' },
      },
      required: ['table'],
    },
  },
  {
    name: 'propose_change',
    description: `Propose a change to a booking or its finances. This does NOT write anything — it shows the owner a before/after card to confirm. Use when the owner wants to fix financial data, change dates, record a payment, or handle a platform switch (e.g. guest cancelled on VRBO and rebooked on Houfy). ALWAYS look up the current booking first (via query_data) so the "before" values are real. NEVER guess the before values. Verify you have the right booking (guest name + property + dates) before proposing.`,
    input_schema: {
      type: 'object',
      properties: {
        change_type: { type: 'string', enum: ['financial', 'dates', 'record_payment', 'platform_switch'], description: 'What kind of change' },
        booking_id: { type: 'string', description: 'The booking being changed (from query_data)' },
        booking_kind: { type: 'string', enum: ['direct', 'platform'], description: 'direct = your bookings table, platform = calendar_blocks' },
        guest_name: { type: 'string', description: 'Guest name, for the confirmation header' },
        property_id: { type: 'string', enum: ['royal-york-east', 'royal-york-west', 'nickel-beach'] },
        summary: { type: 'string', description: 'One plain-English sentence of what will happen, shown on the card' },
        before: { type: 'object', description: 'Current values (label -> value), e.g. {"Platform":"VRBO · cancelled","Amount":"$980 · card","Dates":"Aug 10 → 13"}' },
        after: { type: 'object', description: 'New values (same labels), e.g. {"Platform":"Houfy · confirmed","Amount":"$980 · e-transfer","Dates":"Aug 10 → 13"}' },
        changes: { type: 'object', description: 'The actual field updates to apply on confirm, e.g. {"platform":"houfy","status":"confirmed"}. Use real column names.' },
      },
      required: ['change_type', 'booking_id', 'booking_kind', 'summary', 'before', 'after', 'changes'],
    },
  },
]

export async function runTool(name: string, input: any, ctx: HaussyCtx): Promise<{ ok: boolean; data?: any; error?: string }> {
  if (name === 'propose_task') {
    if (ctx.role !== 'owner') return { ok: false, error: 'Only the owner can create tasks.' }
    return { ok: true, data: { proposed: true, ...input } }
  }
  if (name === 'propose_change') {
    if (ctx.role !== 'owner') return { ok: false, error: 'Only the owner can change bookings or finances.' }
    // does NOT write — returns a proposal the owner confirms via /api/admin/haussy/apply-change
    return { ok: true, data: { proposed_change: true, ...input } }
  }
  if (name === 'mat_report') {
    if (ctx.role !== 'owner') return { ok: false, error: 'MAT figures are restricted to owners.' }
    const supabase = createAdminClient()
    const RATE = 0.04, DAY = 86400000
    const Q: Record<string, [number, number]> = { Q1: [0, 2], Q2: [3, 5], Q3: [6, 8], Q4: [9, 11] }
    const [qs, qe] = Q[String(input.quarter).toUpperCase()] || Q.Q1
    const year = Number(input.year)
    const from = new Date(Date.UTC(year, qs, 1)).toISOString().split('T')[0]
    const to = new Date(Date.UTC(year, qe + 1, 0)).toISOString().split('T')[0]
    const { data: blocks } = await supabase.from('calendar_blocks')
      .select('guest_name, platform, start_date, end_date, accommodation, discount')
      .eq('property_id', 'nickel-beach').eq('is_booking', true)
      .in('platform', ['airbnb', 'vrbo', 'houfy'])
      .lte('start_date', to).gte('end_date', from)
    let revenue = 0, nights = 0, exemptRevenue = 0, missing = 0
    for (const b of blocks || []) {
      const total = Math.max(0, Math.round((new Date(b.end_date + 'T00:00:00').getTime() - new Date(b.start_date + 'T00:00:00').getTime()) / DAY))
      if (!total) continue
      if (!b.accommodation) missing++
      const nightly = ((Number(b.accommodation) || 0) - (Number(b.discount) || 0)) / total
      let inQ = 0
      for (let i = 0; i < total; i++) {
        const d = new Date(new Date(b.start_date + 'T00:00:00').getTime() + i * DAY)
        if (d.getFullYear() === year && d.getMonth() >= qs && d.getMonth() <= qe) inQ++
      }
      nights += inQ
      if (total > 29) exemptRevenue += nightly * inQ
      else revenue += nightly * inQ
    }
    const r2 = (n: number) => Math.round(n * 100) / 100
    return { ok: true, data: { quarter: input.quarter, year, from, to, nights_occupied: nights, room_revenue: r2(revenue), exempt_revenue: r2(exemptRevenue), mat_owed: r2(revenue * RATE), bookings_missing_amounts: missing } }
  }
  if (name === 'search_inventory') {
    const supabase = createAdminClient()
    let qb = supabase.from('expenses').select('vendor, date, property_id, receipt_path, line_items').not('line_items', 'is', null)
    if (input.property_id) qb = qb.eq('property_id', input.property_id)
    const { data } = await qb
    const term = String(input.query || '').toLowerCase()
    const hits: any[] = []
    for (const e of data || []) {
      const li = Array.isArray(e.line_items) ? e.line_items : []
      for (const it of li) {
        if (it?.name && it.name.toLowerCase().includes(term)) {
          hits.push({ name: it.name, price: it.amount ?? null, qty: it.qty ?? 1, store: e.vendor, date: e.date, property: e.property_id, has_receipt: !!e.receipt_path })
        }
      }
    }
    return { ok: true, data: { matches: hits.slice(0, 30), count: hits.length } }
  }
  if (name !== 'query_data') return { ok: false, error: `Unknown tool: ${name}` }

  const table = input.table
  const meta = TABLE_ALLOWLIST[table]
  // GUARD 1: table must be on the allowlist
  if (!meta) return { ok: false, error: `Table "${table}" is not accessible.` }
  // GUARD 2: owner-only tables blocked for non-owners
  if (meta.ownerOnly && ctx.role !== 'owner') {
    return { ok: false, error: `The "${table}" table is restricted to owners.` }
  }

  const supabase = createAdminClient()
  try {
    // GUARD 3: SELECT only, row-capped. No write path exists here.
    let q = supabase.from(table).select('*')
    const filters = Array.isArray(input.filters) ? input.filters : []
    for (const f of filters) {
      if (!f?.column || !f?.op) continue
      const col = String(f.column), val = f.value
      switch (f.op) {
        case 'eq': q = q.eq(col, val); break
        case 'neq': q = q.neq(col, val); break
        case 'gte': q = q.gte(col, val); break
        case 'lte': q = q.lte(col, val); break
        case 'gt': q = q.gt(col, val); break
        case 'lt': q = q.lt(col, val); break
        case 'ilike': q = q.ilike(col, `%${val}%`); break
      }
    }
    if (input.order_by) q = q.order(String(input.order_by), { ascending: input.order_dir !== 'desc' })
    const limit = Math.min(Number(input.limit) || 100, 200)  // hard cap
    q = q.limit(limit)

    const { data, error } = await q
    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Query failed' }
  }
}
