import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { extractReceipt } from '@/lib/extract-receipt'

export async function POST(request: NextRequest) {
  let event: any
  try {
    event = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  if (event.type !== 'email.received') {
    return NextResponse.json({ ok: true }) // ignore non-receive events
  }

  const data = event.data || {}
  const from = data.from || null
  const bodyText = data.text || data.subject || ''
  const supabase = createAdminClient()

  // match sender email to a contact
  let contactId: string | null = null
  let contactName: string | null = null
  if (from) {
    // from may be "Name <email@x.com>" — pull the address
    const emailMatch = from.match(/<([^>]+)>/)
    const addr = (emailMatch ? emailMatch[1] : from).toLowerCase().trim()
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, name')
      .contains('emails', [addr])
      .maybeSingle()
    if (contact) { contactId = contact.id; contactName = contact.name }
  }

  let receiptPath: string | null = null
  let content: any = null

  // attachments arrive as metadata — fetch the first image/pdf via Resend Attachments API
  const attachment = (data.attachments || [])[0]
  if (attachment?.content) {
    // some inbound providers inline base64; handle that
    const base64 = attachment.content
    const ctype = attachment.content_type || 'image/jpeg'
    const ext = ctype.includes('pdf') ? 'pdf' : (ctype.split('/')[1] || 'jpg')
    receiptPath = `inbound/${Date.now()}.${ext}`
    try {
      const bytes = Buffer.from(base64, 'base64')
      await supabase.storage.from('property-management').upload(receiptPath, bytes, { contentType: ctype })
    } catch { receiptPath = null }

    content = ctype.includes('pdf')
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: ctype, data: base64 } }
  } else if (bodyText.trim()) {
    content = { type: 'text', text: `Receipt email:\n${bodyText}` }
  }

  // run extraction if we have something
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
    raw_text: bodyText.slice(0, 2000),
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
