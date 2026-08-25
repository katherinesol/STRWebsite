/* Why a gift was given. Lives beside the note in booking_gifts, never on the
 * booking or the guest — an occasion is as revealing as the note it explains,
 * and the whole point of the separate table is that a surprise stays one.
 *
 * VALIDATED HERE, NOT IN THE DATABASE. The column is a plain nullable text with
 * no check constraint, on purpose: this list will grow, and a constraint would
 * make every addition a trip to the SQL editor. Same arrangement as
 * normaliseCategory for expense categories — the app owns the vocabulary. */

export const GIFT_OCCASIONS = [
  'welcome',
  'birthday',
  'anniversary',
  'thank-you',
  'holiday',
  'milestone',
  'apology',
  'other',
] as const

export type GiftOccasion = (typeof GIFT_OCCASIONS)[number]

/** Null for anything not on the list — an occasion is optional, so a bad value
 *  becomes no value rather than a rejected save or an invented one. */
export function normaliseOccasion(input: unknown): GiftOccasion | null {
  const raw = typeof input === 'string' ? input.trim().toLowerCase() : ''
  if (!raw) return null
  const exact = GIFT_OCCASIONS.find(o => o === raw)
  if (exact) return exact
  const loose = GIFT_OCCASIONS.find(o => o.replace(/-/g, ' ') === raw.replace(/[-_]/g, ' '))
  return loose ?? null
}

/** For the dropdown — 'thank-you' reads better with a capital and a space. */
export const occasionLabel = (o: string) =>
  o.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase())
