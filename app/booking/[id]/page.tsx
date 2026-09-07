import { notFound } from 'next/navigation'
import { getProperty, getAllProperties } from '@/lib/properties'
import Nav from '@/components/ui/Nav'
import Footer from '@/components/ui/Footer'
import { Suspense } from 'react'
import BookingCheckout from '@/components/booking/BookingCheckout'
import { siteConfig } from '@/lib/site-config'

export async function generateStaticParams() {
  return getAllProperties().map(p => ({ id: p.id }))
}

export default async function BookingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const property = getProperty(id)
  if (!property) notFound()

  return (
    <>
      <Nav />
      <div style={{ marginTop: '56px', minHeight: '100vh', background: 'var(--chalk)' }}>
        <Suspense fallback={
          <div style={{ padding: '80px 40px', textAlign: 'center', fontFamily: 'var(--sans)', color: 'var(--muted)' }}>
            Loading...
          </div>
        }>
          <BookingCheckout property={property} etransferEmail={siteConfig.payments.etransferEmail} />
        </Suspense>
      </div>
      <Footer />
    </>
  )
}
