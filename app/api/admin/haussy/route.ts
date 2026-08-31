import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { TOOL_DEFS, runTool, HaussyCtx } from '@/lib/haussy/tools'

//  Four, not three. Reservations live in two tables, so an occupancy or
//  who's-here question spends two rounds gathering before it can say a word,
//  and a single correction then pushed the answer past the cap. The forced
//  answer below is the real safety net; this just stops it being needed for
//  ordinary questions.
const MAX_TOOL_ROUNDS = 4  // cap tool-call loops per message (cost/abuse containment)

export async function POST(request: NextRequest) {
  // GATE: owner + co-owner only. Never guest-facing.
  if (!await hasRole('owner', 'co-owner')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const auth = await getAuth()
  const ctx: HaussyCtx = { userId: auth.ok ? auth.userId : null, role: auth.ok ? auth.role : 'co-owner' }
  const firstName = auth.ok && auth.name ? auth.name.split(' ')[0] : ''

  const { messages } = await request.json()
  if (!Array.isArray(messages) || !messages.length) return NextResponse.json({ error: 'messages required' }, { status: 400 })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const toolsCalled: any[] = []

  const systemPrompt = `You are Haussy, ${firstName ? firstName + "'s" : "the owner's"} private business assistant for a short-term rental operation (Royal York East, Royal York West, Nickel Beach).

You help with operational questions by using your tools to read real business data, then answering clearly and concisely. You can also PROPOSE bookings and tasks — proposals write nothing; the owner sees a confirmation card and approves.

YOUR TOOLS:
- query_data — read any allowed table (reservations, guests, expenses, invoices, tasks…). This is your workhorse for any "what/who/when/how much" question.
- mat_report — Municipal Accommodation Tax owed for a quarter.
- search_inventory — things bought, from receipts ("what plates do we use", "what did the towels cost").
- propose_booking — the owner describes a stay in words; you turn it into a draft booking. WRITES NOTHING.
- propose_task — a reminder or recurring obligation. WRITES NOTHING.

EFFICIENCY: Call all the tools you need in a SINGLE turn (in parallel) rather than one at a time. Don't call tools you don't need. Answer as soon as you have enough.

RULES:
- Only answer from data your tools return. Never invent numbers, dates, guest details, or financials.
- If a tool returns no data or an error, say so plainly — don't guess.
- The current user's role is "${ctx.role}". If a tool is restricted (e.g. finances are owner-only) and returns a restriction error, tell the user that data isn't available to their role — do not try to work around it.
- Be concise and practical. Use plain language. Format money as $X.XX.
- Today is ${new Date().toISOString().split('T')[0]}.
- NEVER compute or state tax yourself on a proposed booking. The server computes HST and MAT from the real municipal rules and shows them on the confirmation card. Say that the card will show the tax.
- You cannot edit or delete existing records. If the owner wants a change to something that already exists, tell them which screen to use.`

  // conversation working set
  const convo: any[] = messages.map((m: any) => ({ role: m.role, content: m.content }))

  let finalText = ''
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      system: systemPrompt,
      tools: TOOL_DEFS as any,
      messages: convo,
    })

    // collect any text
    const textParts = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text)
    if (textParts.length) finalText = textParts.join('\n')

    const toolUses = resp.content.filter((b: any) => b.type === 'tool_use')
    if (!toolUses.length) break  // no more tools → done

    // run each requested tool, server-side, role-scoped
    convo.push({ role: 'assistant', content: resp.content })
    const toolResults: any[] = []
    for (const tu of toolUses as any[]) {
      const result = await runTool(tu.name, tu.input, ctx)
      toolsCalled.push({ tool: tu.name, input: tu.input, ok: result.ok })
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(result.ok ? result.data : { error: result.error }),
      })
    }
    convo.push({ role: 'user', content: toolResults })
  }

  /*  THE LOOP COULD END WITHOUT AN ANSWER, and that is what a blank reply was.
   *
   *  If the last permitted round came back still calling tools, those tools ran,
   *  their results were pushed onto the conversation — and then the loop
   *  exited. The model was never asked what the results meant. finalText held
   *  whatever text happened to accompany that last tool call, which is usually
   *  nothing, and an empty string was returned as though it were an answer.
   *
   *  "How many nights was Nickel Beach rented in 2026" hit it every time:
   *  reservations live in two tables, so it costs two rounds before a word can
   *  be said, and any correction at all pushes the answer past the cap.
   *
   *  One more call with the tools REMOVED. It cannot ask for anything else, so
   *  it has to answer from what it already gathered — and it has everything,
   *  because the results are all in convo. */
  if (!finalText.trim()) {
    try {
      const forced = await client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1500,
        system: systemPrompt + `\n\nYou have run out of tool calls for this message. Answer NOW from the tool results already in this conversation. If they are not enough, say exactly what is missing and what you would need to look up — do not stay silent, and do not invent anything.`,
        messages: convo,
      })
      finalText = forced.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
    } catch {
      // fall through to the guard below
    }
  }

  /*  And if even that produced nothing, say so. An empty bubble reads as the
      assistant ignoring the question; it was in fact working and ran out of
      room. Silence that looks like indifference is the worst of both. */
  if (!finalText.trim()) {
    finalText = "I couldn't finish that one — it needed more lookups than I'm allowed in a single message. Try narrowing it (one property, or a shorter date range), or ask me for the occupancy figure directly."
  }

  // audit log — every question + every tool call
  try {
    const supabase = createAdminClient()
    const lastUser = [...messages].reverse().find((m: any) => m.role === 'user')
    await supabase.from('haussy_log').insert({
      user_id: ctx.userId, user_role: ctx.role,
      question: typeof lastUser?.content === 'string' ? lastUser.content : JSON.stringify(lastUser?.content),
      tools_called: toolsCalled,
      answer_preview: finalText.slice(0, 500),
    })
  } catch {}

  return NextResponse.json({ answer: finalText, tools: toolsCalled })
}
