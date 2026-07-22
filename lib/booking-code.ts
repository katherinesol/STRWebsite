// Generates Airbnb-style confirmation codes (10-char uppercase alphanumeric, no ambiguous chars)
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  // no I, O, 0, 1 (avoid confusion)

export function generateConfirmationCode(): string {
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)]
  }
  return 'HAUS-' + code
}
