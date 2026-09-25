import { redirect } from 'next/navigation'

/*  Migrated to /keyholder/access/locks.
 *
 *  REDIRECTED ONLY NOW, because this was the sole home of set-code and the
 *  morning check — the same ordering every other retirement followed: build the
 *  replacement, prove it operates, then redirect. The replacement queues codes,
 *  shows the worker's health, and carries the lock roster this page never had.
 *
 *  WHAT WAS WRONG WITH IT was not that it was dark. It called a Seam write path
 *  against an account that answers 401, ignored the result, saved the code onto
 *  the booking and showed a green tick — a door code that was on no lock, with
 *  the sweep that would have contradicted it reading through the same dead key.
 *  Restyling that would have produced a prettier screen telling the same lie. */
export default function LegacyRedirect() {
  redirect('/keyholder/access/locks')
}
