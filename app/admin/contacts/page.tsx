import { redirect } from 'next/navigation'

/*  Retired — contacts are people, and people live in one place now.
 *
 *  /keyholder/people holds guests and contractors in the same table, flagged
 *  with is_guest and is_contractor, because a cleaner who once stayed is one
 *  human being and two records of them is the duplicate problem the guest table
 *  already has, reproduced where no merge tool can reach it.
 *
 *  Nothing was migrated: `contacts` held zero rows, which is why this was the
 *  cheapest possible moment to do it.
 *
 *  WHAT THIS ORPHANS, written down as it happens rather than found by a later
 *  audit — the discipline the house-guide gap earned: ContactsManager.tsx now
 *  has no page, and /api/admin/contacts has no caller.
 *
 *  WHAT IT DOES NOT ORPHAN, because this was checked rather than assumed:
 *  app/api/inbound/email matched an incoming sender against contacts.emails to
 *  attribute a receipt. It reads `guests.email` now, in the same commit. Left
 *  alone it would have kept working and matched nothing — receipts arriving
 *  unattributed, with nothing to say why. */
export default function LegacyRedirect() {
  redirect('/keyholder/people')
}
