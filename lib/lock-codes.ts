import { Seam } from 'seam'
import { locksForProperty } from '@/lib/seam'

function seamClient() {
  const apiKey = process.env.SEAM_API_KEY
  if (!apiKey) throw new Error('SEAM_API_KEY not set')
  return new Seam({ apiKey })
}

// pull last 4 digits from a phone string, or null if fewer than 4 digits
function lastFour(phone?: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : null
}

// every code currently active on ANY of this property's locks — the set to avoid
async function codesInUse(propertyId: string): Promise<Set<string>> {
  const seam = seamClient()
  const locks = await locksForProperty(propertyId)
  const used = new Set<string>()
  for (const lock of locks) {
    try {
      const codes = await seam.accessCodes.list({ device_id: lock.seam_device_id })
      for (const c of codes) if (c.code) used.add(c.code)
    } catch { /* if a lock can't be read, skip — better to risk a rare collision than fail the booking */ }
  }
  return used
}

// choose one code the guest will use on ALL their property's locks:
// prefer last-4-of-phone; fall back to a random unused 4-digit
export async function chooseGuestCode(propertyId: string, phone?: string | null): Promise<string> {
  const used = await codesInUse(propertyId)
  const preferred = lastFour(phone)
  if (preferred && !used.has(preferred)) return preferred
  // random 4-digit not already in use
  for (let i = 0; i < 50; i++) {
    const c = String(Math.floor(1000 + Math.random() * 9000))
    if (!used.has(c)) return c
  }
  throw new Error('Could not find a free code — locks may be near the 100-code limit')
}
