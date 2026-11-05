# Evidence

Screenshots used in the report, named `kan-<ticket>-<what>.png`.

| File                                     | Ticket | Shows                                                                             |
| ---------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| `kan-11-jira-linked-prs.png`             | KAN-11 | Jira Development page listing merged PRs linked by their Jira key                 |
| `kan-15-readme-shown-as-binary.png`      | KAN-15 | GitHub showing the UTF-16 `README.md` as a binary (`BIN`) diff                    |
| `kan-15-readme-utf16-garbled.png`        | KAN-15 | VS Code reading the converted UTF-8 README with the old UTF-16 setting            |
| `kan-15-pr-merge-conflict.png`           | KAN-15 | PR showing "Can't automatically merge" after KAN-11 was squash-merged             |
| `kan-17-ruleset-not-enforced.png`        | KAN-17 | Ruleset configured but not enforced on a private repo on the free plan            |
| `kan-70-er-diagram.png`                  | KAN-70 | The Mermaid ER diagram rendered on GitHub                                         |
| `kan-18-studio-bill.png`                 | KAN-18 | Prisma Studio: the seeded bill (service 1000 bp, GST 900 bp)                      |
| `kan-18-studio-item.png`                 | KAN-18 | Prisma Studio: Chicken Rice 600, Laksa 750, Tiger 800 × 2                         |
| `kan-18-studio-claim.png`                | KAN-18 | Prisma Studio: the 4 claims (Ben and Dan share Tiger)                             |
| `kan-19-red.png`                         | KAN-19 | TDD red: 10 tests fail against the stub                                           |
| `kan-19-green.png`                       | KAN-19 | TDD green: 10 tests pass                                                          |
| `kan-20-red.png`                         | KAN-20 | TDD red: 11 allocation tests fail against the stub                                |
| `kan-20-green.png`                       | KAN-20 | TDD green: 11 allocation tests pass                                               |
| `kan-21-red.png`                         | KAN-21 | Property and regression tests failing (5 failed, 30 passed) before the BigInt fix |
| `kan-21-green-coverage.png`              | KAN-21 | All 35 split tests pass with 100% coverage on `src/split`                         |
| `kan-22-local-checks.png`                | KAN-22 | Lint, Prettier and all tests passing locally before pushing                       |
| `kan-22-five-checks-green.png`           | KAN-22 | All 5 CI checks (including gitleaks) green on the PR                              |
| `kan-22-dependabot-group-one-update.png` | KAN-22 | Dependabot vitest group PR bumping only `vitest`, not `@vitest/coverage-v8`       |
| `kan-22-push-protection-blocked.png`     | KAN-22 | GitHub push protection rejecting a push with a fake AWS key (GH013)               |
| `kan-22-gitleaks-blocks-pr.png`          | KAN-22 | Required gitleaks check failing on a fake API key, merge button disabled          |
| `kan-69-container-diagram.png`           | KAN-69 | Container diagram rendered on GitHub                                              |
| `kan-23-board.png`                       | KAN-23 | Sprint 1 board at the end: 17 Done, only KAN-23 left                              |
| `kan-23-burndown.png`                    | KAN-23 | Sprint 1 burndown: 37 points done, 1 to go, well ahead of the guideline           |
