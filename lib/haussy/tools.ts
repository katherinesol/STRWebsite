import { createAdminClient } from '@/lib/supabase/server'
import { loadRefundNetting } from '@/lib/mat-refunds'

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
    name: 'count_nights',
    description: `How many nights a property was (or will be) occupied over a date range, and how full that is. Use for ANY occupancy question — "how many days is Nickel Beach rented in 2026", "how busy was Royal York West this summer", "what's our occupancy rate".

Do NOT try to answer these by pulling rows with query_data and adding up the dates yourself. Reservations live in two tables, cancelled stays and owner blocks have to be excluded, and a stay overlapping the edge of the range must be clipped to it — all of which this does server-side and exactly.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        property_id: { type: 'string', enum: ['royal-york-east', 'royal-york-west', 'nickel-beach'], description: 'Omit for all properties combined' },
        from: { type: 'string', description: 'Start of the range, YYYY-MM-DD (inclusive)' },
        to: { type: 'string', description: 'End of the range, YYYY-MM-DD (exclusive)' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'propose_block',
    description: `Propose blocking dates so they cannot be booked. This does NOT write anything — the owner sees a confirm card first. Use when they want dates held for themselves, for friends and family, or for cleaning or maintenance: "block Nickel Beach Sep 3 to 7", "hold Royal York West for my parents next weekend", "the west unit is having the floors done Oct 1-3".

A block is NOT a booking. There is no guest, no money and no door code. If they describe a paying guest, use propose_booking instead.

Work the dates out from today. end_date is the day the block ENDS, the way a checkout date works — blocking Sep 3 to Sep 7 holds four nights.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        property_id: { type: 'string', enum: ['royal-york-east', 'royal-york-west', 'nickel-beach'] },
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date: { type: 'string', description: 'YYYY-MM-DD, the day the block ends' },
        reason: { type: 'string', enum: ['owner', 'cleaning', 'maintenance', 'manual'], description: 'owner = the owner or their people are staying' },
        block_for: { type: 'string', enum: ['myself', 'friends-family'], description: 'Only for reason=owner' },
        block_for_name: { type: 'string', description: 'Who it is for, when friends-family' },
        notes: { type: 'string' },
      },
      required: ['property_id', 'start_date', 'end_date'],
    },
  },
  {
    name: 'propose_booking',
    description: `Propose a NEW booking from what the owner typed. This does NOT write anything — it returns a draft that the owner sees on a confirm card with the computed tax, then approves. Use whenever they describe a stay they want recorded, e.g. "book Sarah at Nickel Beach Aug 14-17, $250 a night" or "Tom's staying at Royal York West this weekend, direct, $600 total".

Work the dates out from today. A booking is almost never in the past — if a month/day is given without a year, use the next upcoming occurrence.

kind: 'direct' means the owner's own booking (goes in the bookings table). 'platform' means it came through Airbnb/VRBO/Houfy (goes in calendar_blocks). If they name a platform it is 'platform'; if they say "direct" or name no platform, it is 'direct'.

Give accommodation as the ROOM subtotal for the whole stay before cleaning, fees and tax. If they give a nightly rate, multiply it by the nights yourself and put the result in accommodation, and also set nightly_rate.

NEVER invent money. If they did not say a price, leave the amounts out — the owner fills them in on the card. Do NOT compute tax: the server computes HST and MAT from the real rules and shows them on the card.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        kind: { type: 'string', enum: ['direct', 'platform'], description: 'direct = your own booking, platform = came via Airbnb/VRBO/Houfy' },
        property_id: { type: 'string', enum: ['royal-york-east', 'royal-york-west', 'nickel-beach'] },
        platform: { type: 'string', enum: ['airbnb', 'vrbo', 'houfy', 'other'], description: 'Only for kind=platform' },
        guest_name: { type: 'string' },
        guest_email: { type: 'string' },
        guest_phone: { type: 'string' },
        check_in: { type: 'string', description: 'YYYY-MM-DD' },
        check_out: { type: 'string', description: 'YYYY-MM-DD' },
        guests_count: { type: 'number' },
        nightly_rate: { type: 'number', description: 'Per night, if they gave one' },
        accommodation: { type: 'number', description: 'Room subtotal for the WHOLE stay, before cleaning/fees/tax' },
        cleaning_fee: { type: 'number' },
        extras: { type: 'number', description: 'Pet fee, extra guest fee etc.' },
        discount: { type: 'number', description: 'Positive number' },
        confirmation_code: { type: 'string' },
        trip_purpose: { type: 'string', description: 'Only if they mention why the guest is visiting' },
        notes: { type: 'string', description: 'Anything else worth recording on the booking' },
      },
      required: ['kind', 'property_id', 'check_in', 'check_out'],
    },
  },
]

/*  OCCUPANCY, COUNTED ONCE AND PROPERLY.
 *
 *  "How many nights was Nickel Beach rented in 2026" was returning a blank
 *  screen. Part of that was the tool loop giving up before it answered, but the
 *  rest was this: answering meant pulling both reservation tables, filtering out
 *  cancellations and owner blocks, and subtracting 29 pairs of dates in the
 *  model's head. Every one of those is a place to be quietly wrong, and a
 *  language model doing date arithmetic across dozens of rows is the least
 *  reliable part of the whole system.
 *
 *  THE CLIP IS THE PART THAT WOULD HAVE BEEN GOT WRONG. A stay from Dec 28 to
 *  Jan 3 contributes four nights to one year and two to the next, not six to
 *  whichever end you happen to be asking about. Row-by-row addition either
 *  double-counts it or drops it.
 *
 *  Nights, not days, and deliberately: a stay from the 1st to the 3rd is two
 *  nights. That is how the platforms count, how the tax is computed, and how
 *  the owner thinks about it. */
async function countNights(input: any, ctx: HaussyCtx) {
  const from = String(input.from || '').slice(0, 10)
  const to = String(input.to || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { ok: false, error: 'from and to must be YYYY-MM-DD' }
  }
  if (to <= from) return { ok: false, error: '"to" must be after "from"' }

  const supabase = createAdminClient()
  const day = 86400000
  const asDate = (d: string) => new Date(d + 'T00:00:00Z').getTime()
  const rangeStart = asDate(from), rangeEnd = asDate(to)

  // a stay counts only for the part of it inside the range
  const clip = (s: string, e: string) => {
    const a = Math.max(asDate(s), rangeStart)
    const b = Math.min(asDate(e), rangeEnd)
    return b > a ? Math.round((b - a) / day) : 0
  }

  let plat = supabase.from('calendar_blocks')
    .select('property_id, start_date, end_date, guest_name, platform, reason, block_for, status')
    .lt('start_date', to).gt('end_date', from).neq('status', 'cancelled')
  let dir = supabase.from('bookings')
    .select('property_id, check_in, check_out, status')
    .lt('check_in', to).gt('check_out', from)
  if (input.property_id) {
    plat = plat.eq('property_id', input.property_id)
    dir = dir.eq('property_id', input.property_id)
  }
  const [{ data: pb, error: pe }, { data: db, error: de }] = await Promise.all([plat, dir])
  if (pe || de) return { ok: false, error: (pe || de)?.message || 'query failed' }

  const byProperty: Record<string, any> = {}
  const bump = (pid: string, key: string, n: number) => {
    byProperty[pid] = byProperty[pid] || { platform_nights: 0, direct_nights: 0, owner_blocked_nights: 0, stays: 0 }
    byProperty[pid][key] += n
  }

  for (const b of pb || []) {
    const n = clip(b.start_date, b.end_date)
    if (!n) continue
    // an owner block is not a rented night, and counting it as one would
    // overstate occupancy with the owner's own holidays
    if (b.reason === 'owner' || b.block_for) bump(b.property_id, 'owner_blocked_nights', n)
    else { bump(b.property_id, 'platform_nights', n); bump(b.property_id, 'stays', 1) }
  }
  for (const b of db || []) {
    if ((b as any).status === 'cancelled') continue
    const n = clip((b as any).check_in, (b as any).check_out)
    if (!n) continue
    bump(b.property_id, 'direct_nights', n); bump(b.property_id, 'stays', 1)
  }

  const available = Math.round((rangeEnd - rangeStart) / day)
  const props = Object.entries(byProperty).map(([property_id, v]: any) => {
    const rented = v.platform_nights + v.direct_nights
    return {
      property_id, ...v, rented_nights: rented,
      nights_in_range: available,
      occupancy_pct: Math.round((rented / available) * 1000) / 10,
    }
  })
  const total = props.reduce((a, p) => a + p.rented_nights, 0)

  return {
    ok: true,
    data: {
      from, to, nights_in_range: available,
      by_property: props,
      total_rented_nights: total,
      note: 'Nights, not days: a stay from the 1st to the 3rd is 2 nights. Stays crossing the edge of the range are counted only for the part inside it. Cancellations and owner blocks are excluded from rented nights.',
    },
  }
}

export async function runTool(name: string, input: any, ctx: HaussyCtx): Promise<{ ok: boolean; data?: any; error?: string }> {
  if (name === 'count_nights') return countNights(input, ctx)
  if (name === 'propose_task') {
    if (ctx.role !== 'owner') return { ok: false, error: 'Only the owner can create tasks.' }
    return { ok: true, data: { proposed: true, ...input } }
  }
  if (name === 'propose_block') {
    if (ctx.role !== 'owner') return { ok: false, error: 'Only the owner can block dates.' }
    // Writes NOTHING. The client prices/checks it and only a confirmed card commits.
    return { ok: true, data: { proposed_block: true, ...input } }
  }
  if (name === 'propose_booking') {
    if (ctx.role !== 'owner') return { ok: false, error: 'Only the owner can create bookings.' }
    // Writes NOTHING. The client sends this draft to /api/admin/haussy/booking for a
    // priced, tax-computed preview, and only a confirmed preview reaches the database.
    return { ok: true, data: { proposed_booking: true, ...input } }
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
      .select('id, guest_name, platform, start_date, end_date, accommodation, discount')
      // the assistant must not report a cancelled stay as revenue
      .neq('status', 'cancelled')
      .eq('property_id', 'nickel-beach').eq('is_booking', true)
      .in('platform', ['airbnb', 'vrbo', 'houfy'])
      .lte('start_date', to).gte('end_date', from)
    // a refunded stay is not taxed on the money that went back
    const net = await loadRefundNetting(supabase, (blocks || []).map(b => b.id))
    let revenue = 0, nights = 0, exemptRevenue = 0, missing = 0
    for (const b of blocks || []) {
      const total = Math.max(0, Math.round((new Date(b.end_date + 'T00:00:00').getTime() - new Date(b.start_date + 'T00:00:00').getTime()) / DAY))
      if (!total) continue
      if (!b.accommodation) missing++
      const nightly = Math.max(0, ((Number(b.accommodation) || 0) - (Number(b.discount) || 0))
        - (net.roomForMatByBooking.get(b.id) || 0)) / total
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
    return { ok: true, data: { quarter: input.quarter, year, from, to, nights_occupied: nights, room_revenue: r2(revenue), exempt_revenue: r2(exemptRevenue), mat_owed: r2(revenue * RATE), bookings_missing_amounts: missing,
      airbnb_mat_reversed_not_netted: net.airbnbMatNotNetted || undefined } }
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
    //  COUNT ALONGSIDE THE ROWS, so truncation can be reported rather than
    //  hidden. The cap has always existed; what did not exist was any way for
    //  the model to know it had been applied. It would receive exactly 200 rows,
    //  have no idea more were behind them, and answer with total confidence from
    //  a partial set — which is a worse failure than refusing, because it looks
    //  like an answer.
    let q = supabase.from(table).select('*', { count: 'exact' })
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

    const { data, error, count } = await q
    if (error) return { ok: false, error: error.message }
    const truncated = typeof count === 'number' && count > (data?.length ?? 0)
    return {
      ok: true,
      data: truncated
        ? {
            rows: data,
            returned: data?.length ?? 0,
            total_matching: count,
            truncated: true,
            note: `Only ${data?.length ?? 0} of ${count} matching rows were returned. Say so in your answer — do NOT present a total as if it covered everything. Narrow the filters, or use count_nights for occupancy questions.`,
          }
        : data,
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Query failed' }
  }
}
