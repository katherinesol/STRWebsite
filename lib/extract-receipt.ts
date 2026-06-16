import Anthropic from '@anthropic-ai/sdk'

import { EXPENSE_CATEGORIES } from './expense-categories'

type Extracted = {
  vendor: string | null
  amount: number | null
  hst: number | null
  date: string | null
  category: string | null
  description: string | null
  is_refund: boolean
}

// content can be an image/document block or plain text
export async function extractReceipt(content: any): Promise<Extracted> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `Extract expense data from this receipt. Return ONLY valid JSON, no markdown, no preamble, with these exact keys:
{"vendor": string|null, "amount": number|null, "hst": number|null, "date": "YYYY-MM-DD"|null, "category": string|null, "description": string|null, "is_refund": boolean}
- amount is the total including tax (always positive, even for refunds)
- hst is the HST/GST tax amount only (Ontario 13%), null if not shown
- category must be one of: ${EXPENSE_CATEGORIES.join(', ')}
- description is a short 2-4 word summary
- is_refund is true if this is a refund, return, or credit (negative transaction), false otherwise`

  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: [content, { type: 'text', text: prompt }],
    }],
  })

  const textBlock = msg.content.find((b: any) => b.type === 'text')
  const text = (textBlock && 'text' in textBlock ? textBlock.text : '') || '{}'
  const clean = text.replace(/```json|```/g, '').trim()
  try {
    const parsed = JSON.parse(clean)
    return {
      vendor: parsed.vendor || null,
      amount: parsed.amount != null ? Number(parsed.amount) : null,
      hst: parsed.hst != null ? Number(parsed.hst) : null,
      date: parsed.date || null,
      category: parsed.category || null,
      description: parsed.description || null,
      is_refund: parsed.is_refund === true,
    }
  } catch {
    return { vendor: null, amount: null, hst: null, date: null, category: null, description: null, is_refund: false }
  }
}
