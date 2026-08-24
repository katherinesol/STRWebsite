# Held from deploy

Files kept out of production pending the VRBO/Airbnb tax audit. The `.sha` files
record the hash each one must have in a deploy tarball — the version WITHOUT the
held edit.

The old pre-flight compared the tarball to `origin/main`, which cannot detect a
held file that has been committed: both sides match and the check passes. It did
exactly that on 2026-08-23 and the Q2 apply_tax switch shipped for four minutes.
A recorded hash cannot drift the way a moving branch can.

    for f in $(ls .held/*.sha); do
      n=$(basename "$f" .sha)
      p=$(grep -l "" /dev/null; case $n in
        toronto-mat-report) p=app/api/admin/toronto-mat-report/route.ts ;;
        *) p=components/admin/$n.tsx ;;
      esac)
      [ "$(shasum -a 256 < "$D/$p" | cut -c1-64)" = "$(cat "$f")" ] || echo "HELD FILE CHANGED: $p"
    done

`TaxToggleField.tsx` is untracked, so its check stays "must not exist".

## Before unholding — one stale thing to fix in the same pass

`PlatformBookingForm.tsx` line ~376 carries a link reading **"Edit in Income →"**
pointing at `/admin/income`. That screen was retired on 2026-08-24 and now
redirects to `/keyholder/money/income`, which is **read-only** — income can no
longer be edited anywhere, by design, because the route behind that link
(`/api/admin/income/update`) accepted typed hst and mat and skipped the tax
engine, the guest link and the payout check. It has been deleted.

The link still works and does no harm; the redirect catches it. But the label
promises something that no longer exists, and it was left alone deliberately
rather than touch a held file to fix a caption. Correct it to point at the
booking's figures panel — or drop it — whenever this file is unheld.
