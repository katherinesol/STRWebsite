/*  Whether a permission map allows something — as a pure function.
 *
 *  hasPermission() has to read cookies to know who is asking, which makes the
 *  RULE untestable without a request. The rule is the part worth testing: until
 *  now `money` was the only category any endpoint consulted, so a 'view' grant
 *  and a 'none' grant were indistinguishable everywhere, and the first real
 *  'view' check ships with the door-code gates. A three-level hierarchy nobody
 *  has ever exercised is exactly the thing to prove before it decides who can
 *  hand out a door code.
 *
 *  OWNER AND SUPERADMIN SHORT-CIRCUIT TRUE, before the map is consulted at all.
 *  This is deliberate and load-bearing: an owner has no permission entries, so
 *  reading the map first would deny them everything the moment a category
 *  started being enforced. An auth fix that locks out the owner is the worst
 *  outcome available, so it is checked first and tested first.
 *
 *  A category set to an object rather than a string — `calendar` is
 *  `{addBlocks, deleteOwn}` — is not a level and never grants one. Those have
 *  their own helpers. */

export type Level = 'view' | 'edit'

export function permits(
  who: { role?: string | null; isSuperadmin?: boolean | null; permissions?: Record<string, any> | null },
  category: string,
  level: Level = 'view',
): boolean {
  if (who.role === 'owner' || who.isSuperadmin === true) return true

  const p = (who.permissions || {})[category]
  if (p !== 'view' && p !== 'edit') return false   // 'none', absent, or an object
  return level === 'view' ? true : p === 'edit'
}
