---
name: implement
description: 'Implement a piece of work based on a spec or set of tickets. Drives TDD at the seams, validates, reviews, and commits.'
---

Implement the work described in the spec or ticket you were given. Do not reopen the plan or propose a different approach — whatever was settled upstream is the input; the job is to turn it into a commit.

## Beats, in order

1. Read the ticket or spec. Restate what you will build and the **seams** you'll test at. If the seams aren't stated upstream, name them now.
2. Explore the area. Read `CONTEXT.md` for domain vocabulary and `docs/adr/` for decisions that touch the code you're changing. Look for prefactoring that makes the change easy.
3. Drive `/tdd` at the pre-agreed seams — one red → green slice at a time. Calculation/logic modules (`src/engine`, `src/auth`, industry math) are TDD-mandatory per `CLAUDE.md`: failing test first, then code.
4. Typecheck often (`npm run typecheck`); run single test files as you go (`npx vitest run <path>`).
5. Run the full validation once, at the end: `npm run format:check && npm run lint && npm run typecheck && npm run test:run && npm run build`. `npm run format` auto-fixes formatting.
6. Run `/code-review` against the merge-base with `main`. Address hard Standards violations and missing/wrong Spec findings.
7. Commit to the current branch. Conventional Commit subject; body ends with `Closes #<n>`.

## This repo

- Pure engines stay pure: no `fetch`/DOM/Dexie imports in `src/engine`.
- ESI calls send `X-Compatibility-Date` and a descriptive `X-User-Agent`; respect `X-Ratelimit-*` and `Retry-After`.
- Refresh tokens live in Dexie only — never to Firebase or logs.
- All UI strings through i18next (`src/i18n/locales/en.json`), English only for now.
- One ticket per run. Each ticket is a vertical slice sized for one fresh context.

## What this skill does NOT do

It does not create a branch, open a PR, close the issue, tick acceptance-criteria boxes, or act on `/code-review` findings beyond the fixes above. `/next-ticket` owns branch/PR/merge/close.
