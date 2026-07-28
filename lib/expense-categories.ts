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
