// CRA T2125 (business/self-employment) expense categories — comprehensive
export const EXPENSE_CATEGORIES = [
  'Advertising',
  'Meals & entertainment (50%)',
  'Bad debts',
  'Insurance',
  'Interest & bank charges',
  'Business taxes, licenses & dues',
  'Office expenses',
  'Office stationery & supplies',
  'Professional fees (legal/accounting)',
  'Management & administration fees',
  'Rent',
  'Repairs & maintenance',
  'Salaries, wages & benefits',
  'Property taxes',
  'Travel',
  'Utilities',
  'Telephone & internet',
  'Delivery, freight & express',
  'Motor vehicle (not CCA)',
  'Supplies (cleaning, guest)',
  'Capital cost allowance (CCA)',
  'Other expenses',
]

// categories whose line items are worth tracking as inventory (durable goods you might replace)
export const INVENTORY_CATEGORIES = [
  'Repairs & maintenance',
  'Supplies (cleaning, guest)',
  'Office expenses',
  'Office stationery & supplies',
  'Capital cost allowance (CCA)',
]

// categories that are only 50% deductible (CRA rule)
export const HALF_DEDUCTIBLE = ['Meals & entertainment (50%)']

// ── Category validation ──────────────────────────────────────────────────────
// Asking a model for "one of: …" is an instruction, not a constraint. It returned
// "Motor vehicle" where the list says "Motor vehicle (not CCA)", and that near-miss
// went straight into pending_receipts and would have carried into an expense.
// Anything arriving from a model, an import or a form goes through this first.

const FALLBACK_CATEGORY = 'Other expenses'

/** Lowercase, drop punctuation and bracketed qualifiers, collapse spaces. */
function loosen(s: string): string {
  return s.toLowerCase()
    .replace(/\([^)]*\)/g, ' ')   // "(not CCA)", "(50%)"
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\band\b/g, ' ')      // "repairs and maintenance" == "repairs & maintenance"
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Map any incoming string to a real CRA category.
 * Returns the matched category plus whether it had to be corrected, so callers
 * can surface a silent rewrite rather than hide it.
 */
export function normaliseCategory(input: unknown): { category: string; matched: 'exact' | 'loose' | 'prefix' | 'fallback' } {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw) return { category: FALLBACK_CATEGORY, matched: 'fallback' }

  const exact = EXPENSE_CATEGORIES.find(c => c === raw)
  if (exact) return { category: exact, matched: 'exact' }

  const loose = loosen(raw)
  const byLoose = EXPENSE_CATEGORIES.find(c => loosen(c) === loose)
  if (byLoose) return { category: byLoose, matched: 'loose' }

  // "Motor vehicle" → "Motor vehicle (not CCA)"; "Repairs" → "Repairs & maintenance"
  const byPrefix = EXPENSE_CATEGORIES.find(c => loosen(c).startsWith(loose) || loose.startsWith(loosen(c)))
  if (byPrefix) return { category: byPrefix, matched: 'prefix' }

  return { category: FALLBACK_CATEGORY, matched: 'fallback' }
}

export function isValidCategory(input: unknown): boolean {
  return typeof input === 'string' && EXPENSE_CATEGORIES.includes(input)
}
