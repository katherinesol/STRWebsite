import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireArea } from '@/lib/require-area'

/*  Which of a stay's photos are part of this claim.
 *
 *  NO SECOND UPLOADER. The damage panel sits on the same page as the
 *  walkthrough, which already uploads: signed URL, bytes straight to storage,
 *  captured_at from the shutter. Building a parallel upload path for damage
 *  would mean two pipelines for one bucket and two places for the timestamp
 *  rule to drift. You shoot the damage with the Condition photos control, tag
 *  it `issue` or `after`, then tick it onto the report here.
 *
 *  A PHOTO CAN ONLY JOIN A REPORT ABOUT ITS OWN STAY. The report's booking_id
 *  is read first and every media row is matched against it, so a report id from
 *  one stay cannot pull in another stay's evidence. That is checked server-side
 *  rather than trusted from the page that offered the checkboxes.
 *
 *  ATTACHING IS NOT MOVING. The row keeps its tag and stays in the walkthrough
 *  gallery; report_id is an additional fact about it, not a relocation. Detach
 *  nulls that one field and nothing else -- and so does deleting the report,
 *  because the FK is ON DELETE SET NULL. Evidence outlives the claim. */

async function mediaIdsFor(body: any): Promise<string[] | null> {
  const ids = body?.media_ids
  if (!Array.isArray(ids) || !ids.length) return null
  if (ids.some((x: unknown) => typeof x !== 'string')) return null
  return ids as string[]
}

export async function POST(request: NextRequest) {
  const no = await requireArea('damage', 'edit')
  if (no) return no

  const body = await request.json().catch(() => null)
  const reportId = body?.report_id
  const mediaIds = await mediaIdsFor(body)
  if (typeof reportId !== 'string' || !mediaIds) {
    return NextResponse.json({ error: 'report_id and a non-empty media_ids array are required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: report } = await supabase.from('damage_reports')
    .select('id, booking_id').eq('id', reportId).maybeSingle()
  if (!report) return NextResponse.json({ error: 'No such report' }, { status: 404 })
  if (!report.booking_id) {
    return NextResponse.json({ error: 'This report is not attached to a stay, so it has no photos to draw on.' }, { status: 400 })
  }

  // The scope check: only media of the report's own booking.
  const { data: eligible } = await supabase.from('booking_media')
    .select('id').eq('booking_id', report.booking_id).in('id', mediaIds)
  const ok = (eligible || []).map(m => m.id)
  const refused = mediaIds.filter(id => !ok.includes(id))
  if (!ok.length) {
    return NextResponse.json({ error: 'None of those photos belong to this stay.', refused }, { status: 400 })
  }

  const { error } = await supabase.from('booking_media').update({ report_id: reportId }).in('id', ok)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // refused is reported rather than swallowed — a half-done attach must look half-done.
  return NextResponse.json({ ok: true, attached: ok.length, refused })
}

export async function DELETE(request: NextRequest) {
  const no = await requireArea('damage', 'edit')
  if (no) return no

  const id = request.nextUrl.searchParams.get('media_id')
  if (!id) return NextResponse.json({ error: 'media_id required' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase.from('booking_media').update({ report_id: null }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
