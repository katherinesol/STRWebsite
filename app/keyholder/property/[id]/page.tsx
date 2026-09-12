import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission } from '@/lib/auth'
import PropertyTabs from '@/components/keyholder/PropertyTabs'
import PropertyContentEditor from '@/components/keyholder/PropertyContentEditor'

export const dynamic = 'force-dynamic'

/*  The content tab reads the ROW, not the merged Property object.
 *
 *  loadProperty() merges the table over lib/properties.ts so a missing column
 *  still renders — right for a guest page, wrong for an editor. Merged, an empty
 *  column shows the file's value, Katherine sees text in the box, changes
 *  nothing, and never learns the column is empty. The editor has to show what is
 *  actually stored, including the gaps. */
export default async function ContentTab({ params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) redirect('/keyholder')

  const { id } = await params
  const { data: row } = await createAdminClient().from('properties').select('*').eq('id', id).maybeSingle()
  if (!row) notFound()

  const canEdit = await hasPermission('property', 'edit')

  return (
    <div>
      <PropertyTabs id={id} name={row.name} active="content" />
      {!canEdit && (
        <div style={{ marginBottom: '18px', fontSize: '13px', color: '#8a6d3b' }}>
          You can see this but not change it — content editing is not on your account.
        </div>
      )}
      <PropertyContentEditor
        property={row}
        canEdit={canEdit}
        siteUrl={process.env.NEXT_PUBLIC_SITE_URL || 'https://rental-direct-five.vercel.app'}
      />
    </div>
  )
}
