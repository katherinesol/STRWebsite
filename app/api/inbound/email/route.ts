import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { extractReceipt } from '@/lib/extract-receipt'

const RESEND_KEY = process.env.RESEND_API_KEY

// fetch ALL image/pdf attachments for a received email as base64
async function fetchAllAttachments(emailId: string): Promise<{ base64: string; ctype: string }[]> {
  try {
    const listRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, {
      headers: { Authorization: `Bearer ${RESEND_KEY}` },
    })
    if (!listRes.ok) return []
    const list = await listRes.json()
    const attachments = list.data || list.attachments || []
    const wanted = attachments.filter((a: any) => {
      const ct = a.content_type || ''
      return ct.startsWith('image/') || ct.includes('pdf')
    })
    const results: { base64: string; ctype: string }[] = []
    for (const att of wanted) {
      const url = att.download_url || att.url
      if (!url) continue
      const fileRes = await fetch(url)
      if (!fileRes.ok) continue
      const buf = Buffer.from(await fileRes.arrayBuffer())
      results.push({ base64: buf.toString('base64'), ctype: att.content_type || 'image/jpeg' })
    }
    return results
  } catch {
    return []
  }
}

// fetch email body text if no attachment
async function fetchEmailBody(emailId: string): Promise<string> {
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${RESEND_KEY}` },
    })
    if (!res.ok) return ''
    const data = await res.json()
    const d = data.data || data
    return d.text || d.subject || ''
  } catch {
    return ''
  }
}

export async function POST(request: NextRequest) {
  let event: any
  try { event = await request.json() } catch { return NextResponse.json({ error: 'Invalid' }, { status: 400 }) }
  if (event.type !== 'email.received') return NextResponse.json({ ok: true })

  const data = event.data || {}
  const emailId = data.email_id
  const from = data.from || null
  const subject = data.subject || ''
  const supabase = createAdminClient()

  // match sender to a contact
  let contactId: string | null = null
  let contactName: string | null = null
  if (from) {
    const emailMatch = from.match(/<([^>]+)>/)
    const addr = (emailMatch ? emailMatch[1] : from).toLowerCase().trim()
    const { data: contact } = await supabase.from('contacts').select('id, name').contains('emails', [addr]).maybeSingle()
    if (contact) { contactId = contact.id; contactName = contact.name }
  }

  const attachments = emailId ? await fetchAllAttachments(emailId) : []

  // helper to insert one pending receipt
  async function insertPending(content: any, receiptPath: string | null, bodyText: string) {
    let extracted: any = { vendor: null, amount: null, hst: null, date: null, category: null, description: null, is_refund: false }
    if (content) { try { extracted = await extractReceipt(content) } catch {} }
    // refunds stored as negative amount + negative HST
    const sign = extracted.is_refund ? -1 : 1
    await supabase.from('pending_receipts').insert({
      source: 'email',
      from_address: from,
      contact_id: contactId,
      contact_name: contactName,
      receipt_path: receiptPath,
      raw_text: bodyText.slice(0, 1500),
      vendor: extracted.vendor,
      amount: extracted.amount != null ? sign * Math.abs(extracted.amount) : null,
      hst_paid: extracted.hst != null ? sign * Math.abs(extracted.hst) : null,
      expense_date: extracted.date,
      category: extracted.category,
      description: extracted.is_refund ? `REFUND: ${extracted.description || ''}`.trim() : extracted.description,
      status: 'pending',
    })
  }

  if (attachments.length > 0) {
    // one pending receipt per attachment
    for (const att of attachments) {
      const ext = att.ctype.includes('pdf') ? 'pdf' : (att.ctype.split('/')[1] || 'jpg')
      const receiptPath = `inbound/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
      try {
        await supabase.storage.from('property-management').upload(receiptPath, Buffer.from(att.base64, 'base64'), { contentType: att.ctype })
      } catch {}
      const content = att.ctype.includes('pdf')
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: att.base64 } }
        : { type: 'image', source: { type: 'base64', media_type: att.ctype, data: att.base64 } }
      await insertPending(content, receiptPath, subject)
    }
  } else {
    // no attachments — try email body text
    const bodyText = (emailId ? await fetchEmailBody(emailId) : '') || subject
    const content = bodyText.trim() ? { type: 'text', text: `Receipt email:\n${bodyText}` } : null
    await insertPending(content, null, bodyText)
  }

  return NextResponse.json({ ok: true })
}
