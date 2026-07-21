import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { hasRole, getAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { TOOL_DEFS, runTool, HaussyCtx } from '@/lib/haussy/tools'

const MAX_TOOL_ROUNDS = 3  // cap tool-call loops per message (cost/abuse containment)

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

You help with operational questions by using your tools to read real business data, then answering clearly and concisely.

WHAT YOU CAN ANSWER (pick the RIGHT tool, call multiple in one turn if needed):
- Reservations / check-ins / who's staying → get_reservations
- Money: income, expenses, profit, HST → get_finances (owner only)
- Invoices / bills / what's owed to contractors → get_invoices (owner only)
- Upcoming/planned payments, what's due and when → get_upcoming_payments (owner only)
- Tasks / maintenance → get_tasks
- Guest info / contacts → get_guests

EFFICIENCY: Call all the tools you need in a SINGLE turn (in parallel) rather than one at a time. Don't call tools you don't need. Answer as soon as you have enough.

RULES:
- Only answer from data your tools return. Never invent numbers, dates, guest details, or financials.
- If a tool returns no data or an error, say so plainly — don't guess.
- The current user's role is "${ctx.role}". If a tool is restricted (e.g. finances are owner-only) and returns a restriction error, tell the user that data isn't available to their role — do not try to work around it.
- Be concise and practical. Use plain language. Format money as $X.XX.
- Today is ${new Date().toISOString().split('T')[0]}.
- You currently have READ-ONLY tools. You cannot change any data yet.`

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
