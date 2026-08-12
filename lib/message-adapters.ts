// Channel adapters: deliver a host reply out to the platform, and normalize inbound.
// Each platform implements send(). Inbound is handled by webhook/poll routes that
// upsert into conversations + messages.

type SendResult = { ok: boolean; error?: string; externalId?: string }

// ---- Houfy (REST, needs Authtoken + Authkey) ----
async function sendHoufy(externalThreadId: string, body: string): Promise<SendResult> {
  const token = process.env.HOUFY_AUTHTOKEN
  const key = process.env.HOUFY_AUTHKEY
  if (!token || !key) return { ok: false, error: 'Houfy API credentials not configured (need HOUFY_AUTHTOKEN + HOUFY_AUTHKEY)' }
  try {
    const res = await fetch('https://api.houfy.com/sendMessage', {   // TODO: confirm exact endpoint from docs
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authtoken': token, 'Authkey': key },
      body: JSON.stringify({ conversationId: externalThreadId, message: body }),
    })
    if (!res.ok) return { ok: false, error: `Houfy ${res.status}` }
    const data = await res.json().catch(() => ({}))
    return { ok: true, externalId: data.id }
  } catch (e: any) { return { ok: false, error: e.message } }
}

// ---- Repull (Airbnb / VRBO / Booking.com) ----
async function sendRepull(platform: string, externalThreadId: string, body: string): Promise<SendResult> {
  const key = process.env.REPULL_API_KEY
  if (!key) return { ok: false, error: 'Repull API key not configured (REPULL_API_KEY)' }
  try {
    const res = await fetch(`https://api.repull.dev/v1/conversations/${externalThreadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ message: body }),
    })
    if (!res.ok) { const t = await res.text().catch(() => ''); return { ok: false, error: `Repull ${res.status} ${t.slice(0,120)}` } }
    const data = await res.json().catch(() => ({}))
    return { ok: true, externalId: data?.data?.id }
  } catch (e: any) { return { ok: false, error: e.message } }
}

// ---- Direct / concierge (no external delivery; SMS/email later) ----
async function sendDirect(): Promise<SendResult> {
  // Direct + concierge conversations are in-app; guest sees them via the portal/widget.
  // SMS/email delivery can be added here later (Twilio/Resend).
  return { ok: true }
}

// dispatch a host reply to the right platform
export async function deliverMessage(channel: string, externalThreadId: string | null, body: string): Promise<SendResult> {
  if (!externalThreadId && ['houfy', 'airbnb', 'vrbo', 'booking'].includes(channel)) {
    return { ok: false, error: `No external thread id for ${channel} conversation` }
  }
  switch (channel) {
    case 'houfy': return sendHoufy(externalThreadId!, body)
    case 'airbnb':
    case 'vrbo':
    case 'booking': return sendRepull(channel, externalThreadId!, body)
    default: return sendDirect()
  }
}
