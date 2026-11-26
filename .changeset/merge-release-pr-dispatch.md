---
"@defra/grants-config-utils": minor
---

`mergeReleasePR` now accepts an optional `dispatch` argument
(`{ workflow_id, ref, inputs }`) to control the workflow triggered after the
merge. It defaults to the main publish flow (`publish.yml` on `main`), so
existing callers are unaffected; the hotfix flow passes `publish-hotfix.yml` on
the hotfix branch with a `description` input.
