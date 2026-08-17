// Shared "purpose of trip" options — used by the guest checkout form and both
// admin booking editors so the list never drifts between them.
//
// Guest-supplied and guest-visible. NOT to be confused with gift notes, which
// are admin-only surprise data and live in the separate booking_gifts table.

export const TRIP_PURPOSES = [
  'Work',
  'Leisure',
  'Birthday',
  'Anniversary',
  'Honeymoon',
  'Family visit',
  'Celebration',
] as const

// Selecting this reveals the free-text trip_purpose_note field.
export const TRIP_PURPOSE_OTHER = 'Other'

export const TRIP_PURPOSE_OPTIONS = [...TRIP_PURPOSES, TRIP_PURPOSE_OTHER] as const

export type TripPurpose = (typeof TRIP_PURPOSE_OPTIONS)[number]

export function isOther(purpose: string | null | undefined): boolean {
  return purpose === TRIP_PURPOSE_OTHER
}

// Display helper: falls back to the free-text note when "Other" was chosen.
export function formatTripPurpose(purpose?: string | null, note?: string | null): string {
  if (!purpose) return ''
  if (isOther(purpose)) return note?.trim() ? note.trim() : 'Other'
  return purpose
}
