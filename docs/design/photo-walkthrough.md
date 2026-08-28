# Pre-arrival photo walkthrough

**Design only. Nothing built.** The backend already exists; this is the front end
and three decisions that must be made before any UI writes a row.

## What is already there

`booking_media` and `/api/admin/booking-media` were added in one commit — a
calendar time-format fix that carried them along — and never returned to. The
table holds `booking_id` + `booking_kind`, `property_id`, `storage_path`,
`media_type`, `tag`, `captured_at`, `added_by`, `created_at`. The route does GET
(list with signed URLs), POST (multipart → bucket + row) and DELETE. POST admits
`owner`, `co-owner` and `cleaner`; DELETE only `owner` and `co-owner`.

**Zero components mount it. Zero rows. Zero objects in the bucket.** It is the
`canAddBlocks` shape: correct, complete, never called.

## Three things to settle before a UI exists

### 1. `tag` has no constraint, and neither does `media_type`

Probed against the live table: `'before'`, `'after'`, `'banana'`, `''` and
`'DROP TABLE'` were **all accepted**, and `media_type` took `'pdf'`. The column
defaults to `'after'`, which is a hint about intent and nothing more.

**Recommendation — pin the vocabulary in the database first, not in the UI.** A
UI-only rule is a convention; a CHECK is a guarantee, and this table is about to
hold evidence.

    alter table booking_media
      add constraint booking_media_tag_check
      check (tag in ('before', 'after', 'issue'));

    alter table booking_media
      add constraint booking_media_type_check
      check (media_type in ('photo', 'video'));

Three tags, not two. `before` and `after` carry the comparison; `issue` is for
the shot taken mid-stay when something is found, which otherwise gets mislabelled
`after` and pollutes the departure set. More than three and the vocabulary starts
needing its own documentation.

### 2. The POST will break on a real walkthrough

`request.formData()` streams the file **through the route**, which is precisely
what broke the guide upload at 9.8MB and was rewritten to `createSignedUploadUrl`
so the browser talks to storage directly. A phone photo is 3–5MB and a
walkthrough is twenty to forty of them.

So "the backend is done" is true for one small file and false for the feature.
**The POST needs the signed-URL rewrite before the UI is built** — the same
change `guest-guide` already has, which is the working precedent to copy. Not a
large piece of work, but it is backend work, and it belongs before the front end
rather than after the first failed upload in a basement.

`admin/photos`, `invoices/extract`, `expenses/extract` and `mat-filings` share
the through-the-route pattern and the same latent limit; only `guest-guide` was
fixed. Worth noting, not worth fixing here.

### 3. `captured_at` comes from the file, never the clock

Populate it from the `File.lastModified` the browser supplies, not from upload
time. A photo taken in a basement with no signal and uploaded forty minutes later
must keep the moment it was taken — the timestamp is the entire evidentiary point
of the feature, and an upload time quietly records the wrong thing while looking
correct. `created_at` already records when it arrived; the two are different
facts and the table has room for both.

## The capture UI

Mobile-first, because the whole activity is walking a property holding a phone.

    <input type="file" accept="image/*" capture="environment" multiple>

That gives the native camera and multi-shot on both iOS and Android with no
library. Then one POST per file, sequential rather than parallel — a phone on
one bar does better with a queue than with twenty simultaneous uploads — and a
visible per-file list showing queued, uploading, done or failed.

Mounts on the redesigned stay detail as a **Walkthrough** card, beside the
conditions cards rather than inside the money column.

## Offline tolerance — the real design question

A walkthrough happens in basements, garages and dead spots. An upload that fails
there and drops the photo makes the feature useless exactly where it is most
needed.

**Recommended: hold-and-retry in the page, not a full offline queue.** Keep the
selected `File` objects in component state, upload sequentially, mark failures,
and offer *Retry failed* — with an explicit warning before navigating away that
un-uploaded photos will be lost. That covers the common case, which is a dead
spot for ninety seconds rather than a whole walkthrough offline, and it needs no
service worker, no IndexedDB and no background-sync registration.

**The full queue** — IndexedDB plus a service worker with Background Sync — is
genuinely more robust and survives closing the tab, but it is a substantial piece
of infrastructure with its own failure modes, and Background Sync is still not
available on iOS Safari, which is the likeliest phone here. It would add
complexity without covering the platform that needs it most.

**Minimum viable if even hold-and-retry is too much:** upload one file at a time,
keep failures visibly in the list, and never clear a photo from the list until
its row exists. Silence on failure is the only unacceptable outcome.

## The gallery

GET already returns signed URLs, so this is presentation. A grid grouped by tag —
**Before**, **After**, **Issue** — each photo showing `captured_at` rather than
upload time, and the `added_by` name. Delete stays owner/co-owner: a cleaner may
add evidence and may not remove it, which is the right asymmetry for a record
that exists to settle disputes, and it is already how the endpoint behaves.

## Permissions — two decisions

**Which category?** The endpoint is role-only today. `property` is the closest
existing category, but it is a poor fit: these are photos of *a stay*, not of the
listing, and someone allowed to edit marketing images has no obvious claim to a
guest's condition record. **Recommendation: keep it role-only.** The role floor
already encodes the real rule — cleaners add, owners delete — and inventing a
category to satisfy symmetry would either lock cleaners out of their own job or
grant them a category they should not otherwise hold.

**Should a cleaner see a stay they did not work?** Today GET returns any booking's
media to any cleaner. **Recommendation: leave it.** Scoping would need a
cleaner-to-stay assignment that does not exist, and the practical risk is low
against the cost of building one. Worth recording as a known looseness rather
than pretending it is a decision.

## Why this is a damage feature, not a photo feature

A `before` walkthrough is the evidence an `after` claim is measured against.
Heremela's damage claim settled at **$2,464.57** with no documented pre-arrival
condition — the recovery worked out, but nothing in the system could show what
the property looked like before that stay.

`damage_reports` already carries its own `photo_urls` and a `linked_to_deposit`
flag, and both are per-incident and reactive. This is the other half: taken
before anything has gone wrong, when nobody yet knows which stay will need it.
**The connection worth building later** is a damage report offering the same
booking's `before` set alongside its own photos, so a claim is assembled rather
than reconstructed.

## Order, if approved

1. The two CHECK constraints — before any row is written.
2. The signed-URL rewrite of POST — before any real upload.
3. The capture card with hold-and-retry.
4. The gallery grouped by tag.
5. Later: the damage-report link.
