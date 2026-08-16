import { PROPERTIES } from '@/lib/properties'
import { notFound } from 'next/navigation'
import GuestHub from '@/components/guest/GuestHub'

export default async function HubPage({ params }: { params: Promise<{ property: string }> }) {
  const { property } = await params
  const prop = PROPERTIES[property]
  if (!prop) notFound()
  return <GuestHub propertyId={property} propertyName={prop.name} />
}
