import { redirect } from 'next/navigation'

/*  RETIRED 2026-08-27.
 *
 *  Everything this screen did now lives at /keyholder/money/invoices, verified
 *  three ways before the redirect went in: a capability inventory, a
 *  button-by-button mapping of all twenty of its actions, and a reachability
 *  check confirming every invoice — not only the ones still owing — is reachable
 *  from the new list.
 *
 *  It stayed open longer than the rest of the legacy tree because two coverage
 *  checks each found something only it could do: receipt extraction, then editing
 *  a payment after it was recorded. Both were built rather than dropped.
 *
 *  Unlike the legacy booking pages this retired independently of the VRBO/Airbnb
 *  tax audit: it mounted no components and imported one constants file, so none
 *  of the four held files was reachable through it.
 *
 *  The redesigned screen also does several things this one never could — a note
 *  on an invoice, a payment reference, a tax RATE rather than a typed amount, the
 *  uploaded receipt kept on the invoice, and an expense that stays in step when a
 *  payment is edited or deleted. */
export default function RetiredInvoicesPage() {
  redirect('/keyholder/money/invoices')
}
