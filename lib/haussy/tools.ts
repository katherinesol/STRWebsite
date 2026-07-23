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
]

export async function runTool(name: string, input: any, ctx: HaussyCtx): Promise<{ ok: boolean; data?: any; error?: string }> {
  if (name === 'propose_task') {
    if (ctx.role !== 'owner') return { ok: false, error: 'Only the owner can create tasks.' }
    return { ok: true, data: { proposed: true, ...input } }
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
