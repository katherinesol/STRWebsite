import { redirect } from 'next/navigation'

// Moved into the rebrand shell under Assistant. The legacy page wrote bookings
// without hst / mat / apply_tax / taxes_you_remit; redirecting rather than leaving
// it reachable is what stops that defect being re-created.
export default function HaussyMoved() {
  redirect('/keyholder/assistant')
}
