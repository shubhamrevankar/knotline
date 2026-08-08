# Public repository security audit

Date: 2026-08-08

## Result

No high-confidence credentials or private keys were found in the current
tracked tree or Git history.

Only the following environment templates are tracked:

- `.env.example`
- `infra/resume/.env.resume.example`

The live résumé configuration (`infra/resume/.env.resume`) and local overrides
remain ignored by Git. Neither file appears in repository history.

## Checks performed

- Ran the repository secret scanner and its self-test.
- Scanned all Git revisions for common OpenAI, Google, Slack, GitHub, AWS, and
  PEM private-key signatures without printing matched values.
- Checked tracked environment and package-manager configuration files.
- Confirmed the rewritten Git author/committer history contains the intended
  personal email and no former corporate email.
- Corrected the scanner's assigned-secret rule so empty environment variables
  cannot consume the following line and produce a false positive.

## Before making the repository public

- Keep `.env.resume`, `.env.local`, database dumps, exported run evidence, and
  connector credentials untracked.
- Review `git status --ignored` before every public release.
- Run `pnpm verify:secrets` in CI and locally.
- Rotate a provider credential immediately if it is ever pasted into an issue,
  commit, screenshot, build log, or exported artifact.
- Keep OpenAI project budgets and public API rate limits enabled even when no
  credential has been exposed.

This audit is a focused credential-exposure check, not a substitute for runtime
penetration testing or provider-side access review.
