# Deploying

The Vercel project is **not git-connected**. Pushing to `origin/main` deploys
nothing; every release is published from a terminal with `vercel --prod`, under
whoever runs it.

`vercel --prod` uploads **the working directory**, including files that are
untracked or modified-but-uncommitted. Work held back on purpose ships anyway if
you deploy from the repo. So deploys are done from a clean checkout of the
commit being released, never from `~/Desktop/rental-direct`.

## The method

```sh
cd ~/Desktop/rental-direct
git push origin main                  # publishes nothing; just syncs the ref

D=/tmp/deploy-$(git rev-parse --short origin/main)
rm -rf "$D" && mkdir -p "$D"
git archive origin/main | tar -x -C "$D"

mkdir -p "$D/.vercel"                                  # REQUIRED — see below
cp .vercel/project.json "$D/.vercel/project.json"

cd "$D" && vercel --prod
```

`git archive` can only emit committed files, which is the whole point: held work
is structurally incapable of riding along.

## Copy `.vercel/project.json` — this step is not optional

`.vercel/` is untracked, so `git archive` never includes it. Deploying from a
tree with no project link does **not** fail and does **not** prompt. Vercel
treats the directory as a new project, names it after the folder, and publishes
there. That project has none of this one's environment variables, so the build
dies at prerender — but the real failure already happened silently: you deployed
to the wrong place.

This bit once, on 2026-08-23. The tree was `scratchpad/deploy-cde`, so a project
literally called `deploy-cde` appeared on the account and took the release.
Production was untouched only by luck of the naming. Symptoms, if it recurs:

- build log ends `Export encountered an error on /page: /`
- the JSON result shows `"inspectorUrl": ".../<folder-name>/..."` rather than
  `.../rental-direct/...`

`prj_7OUGI3np6PslxYHw6erRfNmdcxGP` / `team_R13qy3zoRQOAxYe3didWSECW` is the real
project. Verify before deploying, not after.

## Pre-flight — check held files against `.held/*.sha`, never against a branch

```sh
fail=0
for n in toronto-mat-report BookingEditForm PlatformBookingForm; do
  case $n in
    toronto-mat-report) p=app/api/admin/toronto-mat-report/route.ts ;;
    *) p=components/admin/$n.tsx ;;
  esac
  [ "$(shasum -a 256 < "$D/$p" | cut -c1-64)" = "$(cat .held/$n.sha)" ] \
    || { echo "HELD EDIT IS IN THE TARBALL: $p"; fail=1; }
done
test -e "$D/components/admin/TaxToggleField.tsx" && { echo "TaxToggleField PRESENT"; fail=1; }
cat "$D/.vercel/project.json"      # expect projectName: rental-direct
[ "$fail" = 0 ] || echo "DO NOT DEPLOY"
```

### The trap this replaced, and why the old check could not see it

The pre-flight used to diff the tarball against `origin/main`. That verifies the
tarball is a faithful copy of the branch — which it always is, because
`git archive` builds it from the branch. It says nothing about whether the branch
should contain the file.

On 2026-08-23 a wildcard stage (`git add -A … app/api …`) swept
`app/api/admin/toronto-mat-report/route.ts` into a commit. It carried the held Q2
`apply_tax` master switch. The pre-flight compared tarball to `origin/main`, both
now contained the edit, and it reported clean. The switch was live for about four
minutes. Nothing moved — no Toronto platform booking has `apply_tax` false, so it
had nothing to act on — but the check was structurally incapable of catching it.

A recorded hash cannot drift. `.held/*.sha` holds the hash of each file WITHOUT
its held edit, so committing the edit changes the tarball hash, the comparison
fails, and the deploy stops.

This was the second time in one evening that the held-file boundary was the weak
point; the first was an earlier commit-sweep that needed the commit split before
deploying. Both were staging accidents. Two habits follow:

- **Stage held files by name, never by directory.** `git add app/api` is how this
  happened. `git add app/api/admin/haussy/` would not have.
- **`git status` after committing, before deploying.** All four held files must
  still be listed as modified or untracked. If one has vanished from that list,
  it is in the commit.

Then check `vercel ls rental-direct --prod` afterwards: the new deployment
should be at the top, `Ready`, `Production`.

## Currently held from deploy

Pending the VRBO/Airbnb audit — the tax toggle must not ship before the audit
settles what each platform actually remits:

- `components/admin/TaxToggleField.tsx` (untracked)
- `components/admin/BookingEditForm.tsx` (modified)
- `components/admin/PlatformBookingForm.tsx` (modified)
- `app/api/admin/toronto-mat-report/route.ts` (modified — the `apply_tax` master switch)

Keep them uncommitted. If a commit sweeps them up, split it before deploying.
