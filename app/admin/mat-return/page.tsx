import { redirect } from 'next/navigation'

// Moved into the rebrand shell under Money → Tax & filing.
export default function MatReturnMoved() {
  redirect('/keyholder/money/tax')
}
