import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hasRole, hasPermission, getAuth } from '@/lib/auth'
import { findGuest, splitName, normaliseEmail, normalisePhone } from '@/lib/keyholder/guest-match'

/* Who is on a booking, and who may be added to it.
 *
 *  booking_guests is the authority on the set; bookings.guest_id and
 *  calendar_blocks.guest_id remain the fast pointer to the lead, mirrored here
 *  as a role='lead' row. A partial unique index keeps that to exactly one, and
 *  this route never tries to talk it out of that — the lead is reassigned by
 *  promoting somebody, not by deleting the row that holds the invariant.
 *
 *  Owner and co-owner only. This returns guest email and phone, which is the
 *  most personal table in the app, and the guest-facing side must never reach
 *  it — a guest-facing view selects name and role, nothing else. */

const KINDS = ['direct', 'platform']

/*  Per method: reading who is on a booking is not the same as adding someone,
    and POST can also CREATE a guest record, so it is guests,edit either way. */
async function gate(level: 'view' | 'edit' = 'view') {
  return (await hasRole('owner', 'co-owner')) && (await hasPermission('guests', level))
}

export async function GET(request: NextRequest) {
  if (!await gate('view')) return NextResponse.json({ error: 'Not allowed to view booking guests' }, { status: 403 })
  const sp = request.nextUrl.searchParams
  const booking_id = sp.get('booking_id') || ''
  const booking_kind = sp.get('booking_kind') || ''
  if (!booking_id || !KINDS.includes(booking_kind)) {
    return NextResponse.json({ error: 'booking_id and booking_kind required' }, { status: 400 })
  }
  const supabase = createAdminClient()
  const { data: rows, error } = await supabase
    .from('booking_guests')
    .select('id, role, added_at, guest:guests(id, name, first_name, last_name, email, phone)')
    .eq('booking_id', booking_id).eq('booking_kind', booking_kind)
    .order('role', { ascending: true })          // 'co_guest' < 'lead' alphabetically, so flip below
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  /* link_id is the booking_guests row; guest_id is the person. Spreading the
     guest over an `id` key silently overwrote the link id, which is what a
     removal has to target — it would have unlinked by the wrong identifier. */
  const people = (rows || [])
    .map((r: any) => ({
      link_id: r.id, role: r.role, added_at: r.added_at,
      guest_id: r.guest?.id ?? null,
      name: r.guest?.name ?? null,
      first_name: r.guest?.first_name ?? null,
      last_name: r.guest?.last_name ?? null,
      email: r.guest?.email ?? null,
      phone: r.guest?.phone ?? null,
    }))
    .sort((a, b) => (a.role === 'lead' ? -1 : b.role === 'lead' ? 1 : 0))

  /* Party size is not the access set and the screen must not imply it is: a
     family of six may have two people recorded because only two needed a code. */
  const table = booking_kind === 'direct' ? 'bookings' : 'calendar_blocks'
  const { data: bk } = await supabase.from(table).select('guests').eq('id', booking_id).maybeSingle()

  return NextResponse.json({ people, party_size: bk?.guests ?? null })
}

/** Add somebody to a booking. Always as a co-guest — see below. */
export async function POST(request: NextRequest) {
  if (!await gate('edit')) return NextResponse.json({ error: 'Not allowed to change booking guests' }, { status: 403 })

  const raw = await request.json().catch(() => null)
  if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 })

  const ACCEPTED = new Set(['booking_id', 'booking_kind', 'first_name', 'last_name', 'email', 'phone', 'guest_id', 'force_new'])
  const rejected = Object.keys(raw).filter(k => !ACCEPTED.has(k))
  if (rejected.length) return NextResponse.json({ error: 'Unexpected fields', rejected }, { status: 400 })

  const booking_id = String(raw.booking_id || '')
  const booking_kind = String(raw.booking_kind || '')
  if (!booking_id || !KINDS.includes(booking_kind)) {
    return NextResponse.json({ error: 'booking_id and booking_kind required' }, { status: 400 })
  }

  const first = String(raw.first_name || '').trim()
  const last = String(raw.last_name || '').trim()
  const email = String(raw.email || '').trim()
  const phone = String(raw.phone || '').trim()
  const full = [first, last].filter(Boolean).join(' ')
  if (!full && !raw.guest_id) return NextResponse.json({ error: 'A name is required' }, { status: 400 })

  const supabase = createAdminClient()
  const who = await getAuth()

  /* THE ONE MATCHER, AGAIN. Adding "Sarah Nguyen" who is already a guest links
     to her record rather than minting a second one — five paths each answering
     "is this the same person" differently is what split four guests in two, and
     an access list is exactly where a duplicate does damage: revoke one row and
     the other still opens the door. findGuest refuses anything less than a
     unique, confident match, so a near-miss creates a new person rather than
     silently attaching a stranger to someone else's booking. */
  let guestId: string | null = raw.guest_id ? String(raw.guest_id) : null
  let linkage = 'linked to the record you named'
  if (!guestId) {
    const { data: all } = await supabase.from('guests').select('id, name, email, phone, first_name, last_name')
    const m = findGuest(all || [], { id: '', name: full, email, phone })

    if (m?.certain) {
      // matched on email or phone — identity, not resemblance
      guestId = m.id; linkage = `linked on ${m.on}`
    } else if (m && raw.force_new !== true) {
      /* A NAME MATCH IS NOT AN IDENTITY, AND NEITHER ANSWER IS SAFE TO ASSUME.
         Creating silently gives the booking a second "Josh Klein" — and on an
         access list a duplicate is worse than elsewhere, because revoking one
         row leaves the other still opening the door. Linking silently attaches
         a stranger who happens to share a name to someone else's stay, along
         with their history. So the request stops here and the caller is shown
         who it found. This is the same rule the figures endpoint follows and
         the reason the two Molhem records were never merged automatically. */
      const cand = (all || []).find((g: any) => g.id === m.id)
      return NextResponse.json({
        needs_confirmation: true,
        message: `${cand?.name || 'Someone'} is already a guest. Is this the same person?`,
        candidate: cand ? {
          id: cand.id, name: cand.name, email: cand.email, phone: cand.phone,
        } : null,
      }, { status: 409 })
    } else {
      const { data: made, error: gErr } = await supabase.from('guests').insert({
        name: full || null, ...splitName(full),
        email: normaliseEmail(email) || null,
        phone: normalisePhone(phone) ? phone : null,
      }).select('id').single()
      if (gErr || !made) return NextResponse.json({ error: gErr?.message || 'Could not create the guest' }, { status: 500 })
      guestId = made.id
      linkage = 'new guest created'
    }
  }

  /* ROLE IS NOT TAKEN FROM THE REQUEST. It is always 'co_guest'.
     The lead is written by create_booking_full at creation and by the figures
     endpoint at enrichment; nothing a form posts can mint a second one. The
     partial unique index would refuse it anyway, but refusing at the boundary
     means the caller gets an explanation rather than a constraint violation. */
  const { data: link, error } = await supabase.from('booking_guests').insert({
    booking_id, booking_kind, guest_id: guestId, role: 'co_guest',
    added_by: who.ok ? who.userId : null,
  }).select('id').single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That person is already on this booking.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, link_id: link.id, guest_id: guestId, linkage })
}

/** Remove a co-guest. Never the lead. */
export async function DELETE(request: NextRequest) {
  if (!await gate('edit')) return NextResponse.json({ error: 'Not allowed to change booking guests' }, { status: 403 })
  const link_id = request.nextUrl.searchParams.get('link_id') || ''
  if (!link_id) return NextResponse.json({ error: 'link_id required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: row } = await supabase.from('booking_guests')
    .select('id, role, guest_id, booking_id, booking_kind').eq('id', link_id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not on this booking' }, { status: 404 })

  /* The lead row carries the invariant. Deleting it leaves a booking whose
     payments, figures and guest history point at nobody, and whose guest_id no
     longer has a matching row. Reassigning the lead is promotion, a different
     action with its own consequences — not a delete. */
  if (row.role === 'lead') {
    return NextResponse.json({
      error: 'The lead guest cannot be removed. Make someone else the lead first.',
    }, { status: 409 })
  }

  const { error } = await supabase.from('booking_guests').delete().eq('id', link_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, removed: row })
}
