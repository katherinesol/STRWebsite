import KeyholderTabs from '@/components/admin/KeyholderTabs'

const TABS = [
  { name: 'Income', href: '/keyholder/money/income' },
  { name: 'Expenses', href: '/keyholder/money/expenses' },
  { name: 'Invoices', href: '/keyholder/money/invoices' },
  { name: 'Tax & filing', href: '/keyholder/money/tax' },
]

export default function MoneyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '22px 44px 44px' }}>
      <KeyholderTabs section="Money" tabs={TABS} />
      {children}
    </div>
  )
}
