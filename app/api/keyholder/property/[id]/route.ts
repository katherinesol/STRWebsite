import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission, getAuth } from '@/lib/auth'
import { pick, rejection } from '@/lib/allowlist'
import { CONTENT_FIELDS, validatePois, poiWarnings } from '@/lib/keyholder/property-edit'

/*  Editing what guests read.
 *
 *  Everything this writes is live the moment it lands — the public listing, the
 *  guest hub and the concierge all read the properties table with no draft
 *  state between them and it. That is a deliberate choice, not an oversight: a
 *  draft state nobody remembers to publish is how a corrected house rule sits
 *  unpublished for a month. The editor says so on screen instead.
 *
 *  TWO GATES, AND THEY ASK DIFFERENT QUESTIONS. hasRole keeps this to owner and
 *  co-owner; hasPermission('property','edit') then asks whether this particular
 *  co-owner was given content rights. permits() short-circuits for an owner, so
 *  the second check can never lock Katherine out of her own listings.
 *
 *  THE ADDRESS IS WRITABLE HERE AND NOWHERE ELSE, and it is the one field on
 *  this endpoint that is not marketing copy. publicProperty() strips it from
 *  every public read; lib/address-visibility.ts decides which booked guest sees
 *  it and when. The editor labels it for what it is rather than leaving it in a
 *  list of text boxes, because the difference between map_offset and address is
 *  the difference between "the neighbourhood" and "the front door". */

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await hasRole('owner', 'co-owner')) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }
  if (!await hasPermission('property', 'edit')) {
    return NextResponse.json({ error: 'Not allowed to edit property content' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)

  const p = pick(body, CONTENT_FIELDS)
  if (!p.ok) return NextResponse.json(rejection(p.rejected, CONTENT_FIELDS), { status: 400 })
  if (!Object.keys(p.fields).length) {
    return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: before } = await supabase.from('properties').select('*').eq('id', id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'No such property' }, { status: 404 })

  /*  The places array is checked as a whole and refused as a whole. Saving the
   *  five that parsed would leave Katherine believing six landed. */
  let warnings: ReturnType<typeof poiWarnings> = []
  if ('pois' in p.fields) {
    const v = validatePois(p.fields.pois)
    if (!v.ok) {
      return NextResponse.json({
        error: 'Nothing was saved — some places are not valid yet.',
        issues: v.issues,
        detail: 'The whole list is refused rather than saving the valid ones, so a place that '
          + 'did not land cannot be mistaken for one that did.',
      }, { status: 400 })
    }
    p.fields.pois = v.pois
    const centre = ('map_offset' in p.fields ? p.fields.map_offset : before.map_offset) as any
    warnings = poiWarnings(v.pois, centre)
  }

  const who = await getAuth()
  const { data: after, error } = await supabase
    .from('properties')
    .update({ ...p.fields, updated_at: new Date().toISOString(), updated_by: who.ok ? who.userId : null })
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  /*  THE BANNER SAYS "LIVE AS SOON AS YOU SAVE", SO MAKE THAT TRUE.
   *
   *  The guest hub is force-dynamic and needs nothing. The public listing is
   *  ISR with revalidate = 300, so without this a corrected house rule would sit
   *  behind a cached page for up to five minutes while the editor claimed it was
   *  already live. A promise on screen that the cache quietly breaks is worse
   *  than no promise, and five minutes is exactly long enough for Katherine to
   *  check, see the old text, and assume the save failed. */
  const changed = Object.keys(p.fields).filter(k => JSON.stringify(before[k]) !== JSON.stringify((after as any)[k]))
  if (changed.some(k => k !== 'address')) revalidatePath(`/property/${id}`)

  return NextResponse.json({ ok: true, changed, warnings })
}
