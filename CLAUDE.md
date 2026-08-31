# NeoCom Desk — agent instructions

- Architecture map: docs/ARCHITECTURE.md — read before locating or adding features.
- Read `CONTEXT.md` first: glossary + scope decisions. Use its terms exactly.
- Design tokens/components: `docs/DESIGN.md`. Decisions: `docs/adr/`.
- TDD for all calculation/logic modules (`src/engine`, `src/auth`, industry
  math): failing test first, then code.
- Pure engines stay pure: no fetch/DOM/Dexie imports in `src/engine`.
- ESI calls always send `X-Compatibility-Date` and a descriptive
  `X-User-Agent`; respect `X-Ratelimit-*` and `Retry-After`.
- Refresh tokens live in Dexie only. Never send them to Firebase or logs.
- Validate before commit: `npm run lint && npm run typecheck && npm run test:run`.
  CI additionally runs `npm run format:check` and `npm run build`; PR gate is
  the full set plus the Playwright `e2e` job.
- i18n: all UI strings through i18next (`src/i18n/locales/en.json`). English only for now.

## Agent skills

### Issue tracker

Work is tracked as GitHub issues in `shawndibble/neocom-desk` via the `gh` CLI.
Blocking edges are free text in a `## Blocked by` section, not native GitHub
dependencies. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary; label string equals the canonical role name. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

### Autonomous ticket loop

`/next-ticket` (`.claude/commands/next-ticket.md`) picks the next unblocked
`ready-for-agent` issue, implements it on a branch, opens a PR, waits for CI to
go green (fixing failures), then squash-merges and closes the issue. Run it on a
schedule with `/loop /next-ticket`. Local execution copies of `triage`,
`implement`, `tdd`, and `code-review` live under `.claude/skills/` so the loop
can invoke them.
