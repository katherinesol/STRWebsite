import KeyholderTabs from '@/components/admin/KeyholderTabs'

const TABS = [
  { name: 'Income', href: '/keyholder/money/income' },
  { name: 'Expenses', href: '/keyholder/money/expenses' },
  { name: 'Invoices', href: '/keyholder/money/invoices' },
  { name: 'Tax & filing', href: '/keyholder/money/tax' },
  { name: 'Accounts', href: '/keyholder/money/accounts' },
  { name: 'P&L', href: '/keyholder/money/pnl' },
]

export default function MoneyLayout({ children }: { children: React.ReactNode }) {
  // Horizontal gutter comes from the shell container in app/keyholder/layout.tsx.
  // This used to set its own 44px, which now stacks on top of it.
  return (
    <div style={{ paddingTop: '22px' }}>
      <KeyholderTabs section="Money" tabs={TABS} />
      {children}
    </div>
  )
}
