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

## Pre-flight — nothing is held today

**There are no held files.** `4f257ff` ("Tax toggle comes off hold") released the
last four and deleted `.held/` in the same commit, so the check this section used
to describe has no baseline to compare against and reports every file as changed.
Run it and all three come back `DIFFERS`, which reads exactly like a breach. It
cried wolf on 2026-09-23 and cost a deploy the time to disprove it.

So the pre-flight is now just the two things that are always worth checking:

```sh
cat "$D/.vercel/project.json"      # expect projectName: rental-direct
test -e "$D/.env.local" && echo "SECRETS IN THE TARBALL — DO NOT DEPLOY"
```

`.env.local` is gitignored, so `git archive` cannot include it; the check is
there because the cost of being wrong about that is unbounded and the check is
free.

### If something is ever held again

Put the file's hash **without** its held edit in `.held/<name>.sha`, restore the
comparison below, and list the files under a "Currently held" heading. Delete
both again when the hold lifts — a stale hold is worse than none, because it
trains you to ignore the alarm.

```sh
# only with a real .held/ directory; otherwise this is noise
[ "$(shasum -a 256 < "$D/$p" | cut -c1-64)" = "$(cat .held/$n.sha)" ] \
  || echo "HELD EDIT IS IN THE TARBALL: $p"
```

### Why a recorded hash, and not a diff against the branch (kept — it recurs)

The pre-flight used to diff the tarball against `origin/main`. That verifies the
tarball is a faithful copy of the branch — which it always is, because
`git archive` builds it from the branch. It says nothing about whether the branch
should contain the file.

On 2026-08-23 a wildcard stage (`git add -A … app/api …`) swept
`app/api/admin/toronto-mat-report/route.ts` into a commit carrying the held Q2
`apply_tax` master switch. The pre-flight compared tarball to `origin/main`, both
now contained the edit, and it reported clean. The switch was live for about four
minutes. Nothing moved — no Toronto platform booking has `apply_tax` false, so it
had nothing to act on — but the check was structurally incapable of catching it.

A recorded hash cannot drift. That was the second time in one evening the
held-file boundary was the weak point; the first was an earlier commit-sweep that
needed the commit split before deploying. Both were staging accidents, and the
two habits they taught outlive the hold itself:

- **Stage held files by name, never by directory.** `git add app/api` is how this
  happened. `git add app/api/admin/haussy/` would not have.
- **`git status` after committing, before deploying.** Anything you meant to keep
  back must still be listed. If it has vanished from that list, it is in the
  commit.

Then check `vercel ls rental-direct --prod` afterwards: the new deployment
should be at the top, `Ready`, `Production`.

## The repo is not the source of truth for the database

Three separate incidents now share one shape: something real diverged from what
the repository says, and the repository looked fine the whole time. Libraries
that were deployed but never committed. Held files swept into a commit, where a
diff against origin/main could no longer see them. And an SQL function whose
installed signature did not match the committed `.sql`.

**Installed SQL functions may not match `supabase/*.sql`.** A file in that
directory is a record of what was *intended*, not proof of what is *running* —
nothing enforces that the two agree, and `create or replace` will refuse to
rename a parameter (42P13) if you try to make them agree later. Verify the
signature against the database before calling or re-running one:

    curl -s "$SUPABASE_URL/rest/v1/" -H "apikey: $SERVICE_KEY" \
      -H "accept: application/openapi+json" | jq '.paths | keys[] | select(startswith("/rpc/"))'

Add `| jq '.paths["/rpc/<name>"]'` to see the exact argument names. This matters
because PostgREST resolves a function by the *exact set of argument names* in
the request body: call `merge_guests` with `p_survivor` when it was created with
`survivor_id` and the answer is PGRST202 — reported as *the function does not
exist*, indistinguishable from it never having been installed. A permissions
problem returns 42501 instead, so the two are easy to tell apart once you know
to look.

The same caution applies to grants. `revoke all on function ... from public`
also strips `service_role`, because its access came through PUBLIC — and since
PostgREST builds its schema cache per role, the function then vanishes from the
cache rather than returning a permission error. Every revoke needs a matching
`grant execute ... to service_role`.
