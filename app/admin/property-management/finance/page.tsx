import { redirect } from 'next/navigation'

/* Retired in favour of /keyholder/money/expenses.
 *
 *  This was the only place expenses could be filed, on the legacy dark styling,
 *  and it spent an evening returning 500 because a static pdfjs-dist import ran
 *  during server rendering. Everything it did now lives in the Money section:
 *  the expense ledger, the category breakdown, the receipt queue and the
 *  add/edit/delete path on /keyholder/money/expenses, and the scheduled-payment
 *  list on /keyholder/money/invoices, where it always belonged — it reads
 *  invoice_payments and marking one paid files the expense against its invoice.
 *
 *  One expenses page, not two. */
export default function LegacyFinanceRedirect() {
  redirect('/keyholder/money/expenses')
}
