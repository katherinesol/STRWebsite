import { Resend } from 'resend'

export const getResend = () => new Resend(process.env.RESEND_API_KEY || 're_placeholder')

export const FROM = `${process.env.RESEND_FROM_NAME || 'Direct Stays'} <${process.env.RESEND_FROM || 'onboarding@resend.dev'}>`

const PROPERTY_NAMES: Record<string, string> = {
  'royal-york-east': 'Royal York East Suite',
  'royal-york-west': 'Royal York West Suite',
  'nickel-beach':    'Nickel Beach Retreat',
}

const PROPERTY_ADDRESS: Record<string, string> = {
  'royal-york-east': 'Mimico, Toronto, ON',
  'royal-york-west': 'Mimico, Toronto, ON',
  'nickel-beach':    'Port Colborne, ON',
}

function baseTemplate(content: string, previewText: string = '') {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${previewText}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #F0EDE6; font-family: -apple-system, 'Helvetica Neue', sans-serif; color: #1A1A18; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 40px 20px; }
  .card { background: #FAFAF8; border: 0.5px solid #E8E4DC; padding: 40px; }
  .label { font-size: 10px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: #B8956B; margin-bottom: 8px; }
  .heading { font-size: 28px; font-weight: 300; color: #1A1A18; margin-bottom: 24px; line-height: 1.2; }
  .body { font-size: 14px; color: #555550; line-height: 1.7; margin-bottom: 16px; }
  .divider { border: none; border-top: 0.5px solid #E8E4DC; margin: 24px 0; }
  .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 0.5px solid #F0EDE6; font-size: 13px; }
  .row-label { color: #888880; }
  .row-value { color: #1A1A18; font-weight: 500; text-align: right; }
  .btn { display: inline-block; padding: 14px 32px; background: #1A1A18; color: #FAFAF8 !important; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; text-decoration: none; margin-top: 8px; }
  .code { font-size: 48px; font-weight: 300; letter-spacing: .2em; color: #1A1A18; text-align: center; padding: 24px; background: #F0EDE6; margin: 20px 0; }
  .footer { font-size: 11px; color: #9A9A92; text-align: center; margin-top: 24px; line-height: 1.6; }
  .amber { color: #B8956B; }
</style>
</head>
<body>
<div class="wrap">
  <div style="text-align:center; margin-bottom: 24px;">
    <span style="font-size:22px; font-weight:300; font-style:italic; color:#1A1A18; letter-spacing:.01em;">
      ${process.env.RESEND_FROM_NAME || 'Direct Stays'}<span style="color:#B8956B">.</span>
    </span>
  </div>
  <div class="card">
    ${content}
  </div>
  <div class="footer">
    Questions? Reply to this email or contact us directly.<br>
    ${process.env.RESEND_FROM || 'hello@yourdomain.com'}
  </div>
</div>
</body>
</html>`
}

// 1. Booking confirmation
export async function sendBookingConfirmation(booking: any, guest: any) {
  const propertyName = PROPERTY_NAMES[booking.property_id] || booking.property_id
  const checkIn = new Date(booking.check_in + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const checkOut = new Date(booking.check_out + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const content = `
    <div class="label">${propertyName}</div>
    <div class="heading">You're booked<span class="amber">.</span></div>
    <p class="body">Hi ${guest.name?.split(' ')[0] || 'there'}, your booking is confirmed. We can't wait to host you.</p>
    <hr class="divider">
    <div class="row"><span class="row-label">Booking reference</span><span class="row-value">${booking.booking_reference}</span></div>
    <div class="row"><span class="row-label">Property</span><span class="row-value">${propertyName}</span></div>
    <div class="row"><span class="row-label">Address</span><span class="row-value">${PROPERTY_ADDRESS[booking.property_id] || ''}</span></div>
    <div class="row"><span class="row-label">Check-in</span><span class="row-value">${checkIn} at 4:00 PM</span></div>
    <div class="row"><span class="row-label">Check-out</span><span class="row-value">${checkOut} at 11:00 AM</span></div>
    <div class="row"><span class="row-label">Guests</span><span class="row-value">${booking.guests_adults ? `${booking.guests_adults} adult${booking.guests_adults !== 1 ? 's' : ''}${booking.guests_children ? `, ${booking.guests_children} child${booking.guests_children !== 1 ? 'ren' : ''}` : ''}` : `${booking.guests} guests`}</span></div>
    <div class="row"><span class="row-label">Total</span><span class="row-value">$${booking.total?.toFixed(2)}</span></div>
    <hr class="divider">
    ${booking.payment_method === 'etransfer' ? `
    <p class="body"><strong>Payment instructions</strong><br>
    Send your deposit of $${booking.deposit_amount?.toFixed(2)} by e-transfer to <strong>${process.env.ETRANSFER_EMAIL || 'payments@yourdomain.com'}</strong>. Use your booking reference <strong>${booking.booking_reference}</strong> as the message.</p>
    <hr class="divider">
    ` : ''}
    <p class="body">Your guest portal will be available closer to check-in. You'll receive your access code 48 hours before arrival.</p>
    <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://yourdomain.com'}/portal" class="btn">Access guest portal</a>
  `

  return getResend().emails.send({
    from: FROM,
    to: guest.email,
    subject: `Booking confirmed — ${propertyName} · ${booking.booking_reference}`,
    html: baseTemplate(content, `Your booking at ${propertyName} is confirmed`),
  })
}

// 2. Payment reminder
export async function sendPaymentReminder(booking: any, guest: any, options: {
  amountDue: number
  dueDate: string
  depositPaid: number
  note?: string
  etransferEmail?: string
}) {
  const propertyName = PROPERTY_NAMES[booking.property_id] || booking.property_id
  const checkIn = new Date(booking.check_in + 'T12:00:00').toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })
  const etransferTo = options.etransferEmail || process.env.ETRANSFER_EMAIL || 'payments@yourdomain.com'

  const content = `
    <div class="label">Payment reminder</div>
    <div class="heading">Payment due<span class="amber">.</span></div>
    <p class="body">Hi ${guest.name?.split(' ')[0] || 'there'}, a payment is coming up for your stay at ${propertyName}.</p>
    <hr class="divider">
    <div class="row"><span class="row-label">Booking reference</span><span class="row-value">${booking.booking_reference}</span></div>
    <div class="row"><span class="row-label">Property</span><span class="row-value">${propertyName}</span></div>
    <div class="row"><span class="row-label">Check-in</span><span class="row-value">${checkIn}</span></div>
    <div class="row"><span class="row-label">Deposit paid</span><span class="row-value">$${options.depositPaid?.toFixed(2)}</span></div>
    <div class="row"><span class="row-label">Amount due</span><span class="row-value" style="color:#B8956B; font-size:18px;">$${options.amountDue?.toFixed(2)}</span></div>
    <div class="row"><span class="row-label">Due by</span><span class="row-value">${options.dueDate}</span></div>
    <hr class="divider">
    <p class="body">Send by e-transfer to <strong>${etransferTo}</strong>.<br>Use <strong>${booking.booking_reference}</strong> as the message.</p>
    ${options.note ? `<p class="body" style="background:#F0EDE6; padding:16px; margin-top:8px;">${options.note}</p>` : ''}
    <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://yourdomain.com'}/portal" class="btn">View your booking</a>
  `

  return getResend().emails.send({
    from: FROM,
    to: guest.email,
    subject: `Payment due — ${propertyName} · ${booking.booking_reference}`,
    html: baseTemplate(content, `Payment reminder for your stay at ${propertyName}`),
  })
}

// 3. Access code
export async function sendAccessCode(booking: any, guest: any, code: string) {
  const propertyName = PROPERTY_NAMES[booking.property_id] || booking.property_id
  const checkIn = new Date(booking.check_in + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })

  const content = `
    <div class="label">${propertyName}</div>
    <div class="heading">You're almost here<span class="amber">.</span></div>
    <p class="body">Hi ${guest.name?.split(' ')[0] || 'there'}, check-in is on ${checkIn} at ${booking.early_checkin_granted && booking.early_checkin_time ? booking.early_checkin_time : '4:00 PM'}. Here's your access code:</p>
    <div class="code">${code}</div>
    <p class="body" style="text-align:center; font-size:13px; color:#888880;">Enter this code on the keypad to unlock your suite.</p>
    <hr class="divider">
    <div class="row"><span class="row-label">Check-in</span><span class="row-value">${checkIn} · ${booking.early_checkin_granted && booking.early_checkin_time ? booking.early_checkin_time + ' ★ Early check-in' : '4:00 PM'}</span></div>
    <div class="row"><span class="row-label">Check-out</span><span class="row-value">${new Date(booking.check_out + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })} · ${booking.late_checkout_granted && booking.late_checkout_time ? booking.late_checkout_time + ' ★ Late checkout' : '11:00 AM'}</span></div>
    <hr class="divider">
    <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://yourdomain.com'}/portal" class="btn">Open guest portal</a>
    <p class="body" style="margin-top:16px; font-size:12px;">Your guest portal has everything you need — WiFi, local guide, house instructions, and your full payment summary.</p>
  `

  return getResend().emails.send({
    from: FROM,
    to: guest.email,
    subject: `Your access code — ${propertyName}`,
    html: baseTemplate(content, `Access code for your stay at ${propertyName}`),
  })
}

// 4. Portal setup
export async function sendPortalSetup(guest: any, magicLink: string) {
  const content = `
    <div class="label">Guest portal</div>
    <div class="heading">Set up your portal<span class="amber">.</span></div>
    <p class="body">Hi ${guest.name?.split(' ')[0] || 'there'}, click below to access your guest portal. You'll find your booking details, access code, house guide, and local recommendations all in one place.</p>
    <hr class="divider">
    <a href="${magicLink}" class="btn">Access guest portal</a>
    <p class="body" style="margin-top:16px; font-size:12px; color:#888880;">This link expires in 24 hours. If you didn't request this, you can ignore this email.</p>
  `

  return getResend().emails.send({
    from: FROM,
    to: guest.email,
    subject: 'Access your guest portal',
    html: baseTemplate(content, 'Your guest portal is ready'),
  })
}

// Notify the host when the guest assistant escalates something it couldn't answer.
export async function sendEscalationAlert(opts: { guestName: string; propertyName: string; question: string; checkIn?: string; checkOut?: string }) {
  const to = process.env.HOST_ALERT_EMAIL || process.env.RESEND_FROM || ''
  if (!to) return
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#B8956B;margin-bottom:8px">Guest needs you</div>
      <h2 style="font-weight:400;color:#1A1A18;margin:0 0 12px">${opts.guestName} has a question the assistant couldn't answer</h2>
      <div style="font-size:14px;color:#555;line-height:1.6">
        <p><strong>Property:</strong> ${opts.propertyName}</p>
        ${opts.checkIn ? `<p><strong>Stay:</strong> ${opts.checkIn} → ${opts.checkOut}</p>` : ''}
        <p style="background:#f5f2ec;padding:12px 14px;border-radius:6px"><strong>They asked:</strong><br>${opts.question}</p>
        <p>Reply from your inbox and they'll see it in their chat.</p>
      </div>
    </div>`
  try {
    await getResend().emails.send({ from: FROM, to, subject: `Guest question — ${opts.guestName} at ${opts.propertyName}`, html })
  } catch (e) { console.error('Escalation email failed:', e) }
}
