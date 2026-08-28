/*  Names only — no imports, deliberately.
 *
 *  System Activity is a 'use client' page and needs the event name to colour the
 *  row red. Taking it from lib/lock-alert would have pulled that module's import
 *  of logSystem, and through it createAdminClient and the service-role path,
 *  into the browser bundle. A constant shared across the server/client boundary
 *  has to live somewhere that imports nothing, or it drags the server in with
 *  it. */

export const LOCK_ACTION_NEEDED = 'lock.action_needed'

export type LockIntent = 'program' | 'revoke' | 'reschedule'
