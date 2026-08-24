import KeyholderTabs from '@/components/admin/KeyholderTabs'

const TABS = [
  { name: 'Overview', href: '/keyholder/property' },
  { name: 'Concierge', href: '/keyholder/property/concierge' },
]

/* Concierge lives under Property, not Assistant, per design-doc 6b. Haussy is
   the owner's tool; the concierge belongs to a property — it is chosen per
   property, its knowledge is scoped per property, and its counts are per
   property. Horizontal gutter comes from the shell. */
export default function PropertyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ paddingTop: '22px' }}>
      <KeyholderTabs section="Property" tabs={TABS} />
      {children}
    </div>
  )
}
