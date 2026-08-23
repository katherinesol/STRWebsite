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

## Pre-flight

Confirm the deploy tree is what you think it is, and that held work is absent:

```sh
test -e "$D/components/admin/TaxToggleField.tsx" && echo "HELD FILE PRESENT — STOP"
grep -rl TaxToggleField "$D" --exclude=DEPLOY.md | wc -l   # expect 0 (this file names it)
cat "$D/.vercel/project.json"               # expect projectName: rental-direct
```

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
