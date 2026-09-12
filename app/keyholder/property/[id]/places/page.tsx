import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'
import PropertyTabs from '@/components/keyholder/PropertyTabs'
import PlacesEditor from '@/components/keyholder/PlacesEditor'

export const dynamic = 'force-dynamic'

export default async function PlacesTab({ params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) redirect('/keyholder')

  const { id } = await params
  const { data: row } = await createAdminClient().from('properties').select('*').eq('id', id).maybeSingle()
  if (!row) notFound()

  return (
    <div>
      <PropertyTabs id={id} name={row.name} active="places" />
      <PlacesEditor
        property={row}
        canEdit={await hasPermission('property', 'edit')}
        token={process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim()}
      />
    </div>
  )
}
