import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { extractReceipt } from '@/lib/extract-receipt'

const RESEND_KEY = process.env.RESEND_API_KEY

// fetch attachment list for a received email, returns first image/pdf as base64
async function fetchFirstAttachment(emailId: string): Promise<{ base64: string; ctype: string } | null> {
  try {
    const listRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, {
      headers: { Authorization: `Bearer ${RESEND_KEY}` },
    })
    console.log('ATTACHMENT LIST status:', listRes.status)
    if (!listRes.ok) {
      const errText = await listRes.text()
      console.log('ATTACHMENT LIST error body:', errText)
      ;(globalThis as any).__lastAttachmentDebug = JSON.stringify({ status: listRes.status, error: errText })
      return null
    }
    const list = await listRes.json()
    console.log('ATTACHMENT LIST response:', JSON.stringify(list))
    ;(globalThis as any).__lastAttachmentDebug = JSON.stringify({ status: listRes.status, body: list })
    const attachments = list.data || list.attachments || []
    const att = attachments.find((a: any) => {
      const ct = a.content_type || ''
      return ct.startsWith('image/') || ct.includes('pdf')
    })
    if (!att) return null

    const url = att.download_url || att.url
    if (!url) return null
    const fileRes = await fetch(url)
    if (!fileRes.ok) return null
    const buf = Buffer.from(await fileRes.arrayBuffer())
    return { base64: buf.toString('base64'), ctype: att.content_type || 'image/jpeg' }
  } catch {
    return null
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

  // try attachment first, fall back to email body text
  let content: any = null
  let receiptPath: string | null = null
  let bodyText = subject

  const att = emailId ? await fetchFirstAttachment(emailId) : null
  if (att) {
    const ext = att.ctype.includes('pdf') ? 'pdf' : (att.ctype.split('/')[1] || 'jpg')
    receiptPath = `inbound/${Date.now()}.${ext}`
    try {
      await supabase.storage.from('property-management').upload(receiptPath, Buffer.from(att.base64, 'base64'), { contentType: att.ctype })
    } catch { receiptPath = null }
    content = att.ctype.includes('pdf')
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: att.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: att.ctype, data: att.base64 } }
  } else {
    bodyText = (emailId ? await fetchEmailBody(emailId) : '') || subject
    if (bodyText.trim()) content = { type: 'text', text: `Receipt email:\n${bodyText}` }
  }

  let extracted = { vendor: null, amount: null, hst: null, date: null, category: null, description: null } as any
  if (content) {
    try { extracted = await extractReceipt(content) } catch {}
  }

  await supabase.from('pending_receipts').insert({
    source: 'email',
    from_address: from,
    contact_id: contactId,
    contact_name: contactName,
    receipt_path: receiptPath,
    raw_text: ((globalThis as any).__lastAttachmentDebug ? '[DEBUG] ' + (globalThis as any).__lastAttachmentDebug + ' | ' : '') + bodyText.slice(0, 1500),
    vendor: extracted.vendor,
    amount: extracted.amount,
    hst_paid: extracted.hst,
    expense_date: extracted.date,
    category: extracted.category,
    description: extracted.description,
    status: 'pending',
  })

  return NextResponse.json({ ok: true })
}
