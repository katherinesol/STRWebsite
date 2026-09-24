import { redirect } from 'next/navigation'

/*  The form that could not save.
 *
 *  It posted item, location, photo_urls, amount_claimed and linked_to_deposit
 *  to a table holding none of those columns, wrapped the fetch in `catch {}`,
 *  and then routed to the list whatever came back. Every submission 42703'd and
 *  every one of them looked like a success. damage_reports has zero rows.
 *
 *  It is not rebuilt here. Filing belongs on the stay — that page already knows
 *  which booking this is and already holds the photographs, and asking for the
 *  booking a second time in a dropdown of all of them was the other half of why
 *  this surface was worth deleting rather than fixing. */
export default function RetiredDamageForm() {
  redirect('/admin/damage')
}
