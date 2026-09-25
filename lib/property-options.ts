// property choices for expense/receipt assignment
// 'royal-york-both' = expense applies to both Royal York suites (split or shared)
export const PROPERTY_OPTIONS = [
  { id: '', name: 'Unassigned / all properties' },
  { id: 'royal-york-east', name: 'Royal York East Suite' },
  { id: 'royal-york-west', name: 'Royal York West Suite' },
  /*  THE BUILDING, and the name says so. It read "Royal York (both suites)",
      which describes a split across two units — but the thing being assigned is
      usually a building-level bill: water, the shared entrance, the roof. Those
      are against the building, not against two suites at once. ReceiptQueue and
      /admin/inventory already called it "Royal York"; this was the outlier.
      THE ID IS UNCHANGED. 'royal-york-both' is stored on existing expenses and
      renaming it would orphan every one of them. Only the label moves. */
  { id: 'royal-york-both', name: 'Royal York' },
  { id: 'nickel-beach', name: 'Nickel Beach Retreat' },
]
