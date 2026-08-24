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
