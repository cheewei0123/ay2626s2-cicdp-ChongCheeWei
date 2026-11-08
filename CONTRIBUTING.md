# Contributing

How work gets from a Jira item to `main`. Every branch, commit and PR includes the Jira key (`KAN-<n>`), so it shows on the Jira item's Development panel.

## Branches (trunk-based)

`main` is always deployable and protected: no direct pushes, no force pushes. Work happens on short-lived branches that are deleted after merge.

| Prefix      | Use for                 | Example                         |
| ----------- | ----------------------- | ------------------------------- |
| `feature/`  | New feature             | `feature/KAN-19-sg-charges`     |
| `fix/`      | Bug fix                 | `fix/KAN-<n>-rounding-bug`      |
| `test/`     | Tests only              | `test/KAN-21-split-edge-cases`  |
| `ci/` `cd/` | Pipeline                | `ci/KAN-22-gitleaks-dependabot` |
| `infra/`    | Server and Docker setup | `infra/KAN-<n>-ec2-setup`       |
| `docs/`     | Documentation           | `docs/KAN-68-conventions`       |
| `chore/`    | Tooling and repo setup  | `chore/KAN-15-monorepo`         |

Format: `<prefix>/KAN-<n>-<short-slug>`.

## Commits

```
KAN-<n> <type>(<scope>): <summary>
```

Example: `KAN-19 feat(split): add GST calculation`

| Type       | Use for                                 |
| ---------- | --------------------------------------- |
| `feat`     | New behaviour                           |
| `fix`      | Bug fix                                 |
| `test`     | Adding or changing tests                |
| `docs`     | Documentation                           |
| `ci`       | Workflow and pipeline changes           |
| `chore`    | Tooling, dependencies, config           |
| `refactor` | Code change with no change in behaviour |

The scope is the area touched, e.g. `split`, `db`, `deps`, `repo`.

## Pull requests

- **Title:** same format as a commit (`KAN-<n> <type>(<scope>): <summary>`). Squash merge turns the PR title into the commit on `main`, so it must be right.
- **Description:** fill in the template (`.github/pull_request_template.md`): Jira key, what changed, how I tested it, screenshots, Definition of Done.
- **Merge:** squash merge only, after all required checks pass and the branch is up to date with `main`.

## Required checks

A PR cannot merge until all of these pass (see `docs/pipeline.md`):

`gitleaks` · `lint api` · `lint web` · `test-api` · `test-web` · `test-e2e`

## Definition of Done

- PR merged with all checks green
- New logic has tests (tests first for split and payments)
- Deployed by the pipeline with a passing health check (once deploy exists)
- Notes in `docs/` (learning log, evidence)

## Before pushing

From the repo root:

```bash
npm ci
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

Run `npm ci` (not just `npm install`) after changing dependencies, so the result matches CI's clean install.

## Secrets

Never commit secrets. They live in GitHub Secrets or the server `.env` only; see the table in `docs/pipeline.md`. Gitleaks and GitHub push protection block commits that contain them.
