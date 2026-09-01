---
name: implement
description: 'Implement a piece of work based on a spec or set of tickets. Drives TDD at the seams, validates, reviews, and commits.'
---

Implement the work described in the spec or ticket you were given. Do not reopen the plan or propose a different approach — whatever was settled upstream is the input; the job is to turn it into a commit.

## Beats, in order

1. Explore in a **sub-agent** (`Agent`, `subagent_type: general-purpose`):
   read the ticket or spec, `CONTEXT.md` for domain vocabulary, `docs/adr/`
   for decisions that touch the code you're changing, and the existing code
   in the area (patterns to reuse, prefactoring that makes the change
   easy). This is read-heavy and one-shot — exactly the shape that pays for
   a sub-agent's own context instead of sitting in this one for the rest of
   the run. Have it report back: what to build, the **seams** to test at
   (name them if the ticket doesn't), the acceptance criteria, relevant
   `CONTEXT.md`/ADR excerpts, and existing patterns/files to reuse. Don't
   re-read what the report already gives you.
2. Drive `/tdd` at the seams from that report — one red → green slice at a
   time. Calculation/logic modules (`src/engine`, `src/auth`, industry math)
   are TDD-mandatory per `CLAUDE.md`: failing test first, then code. This is
   the iterative core of the phase and stays inline — each cycle depends on
   the real result of the last one, so splitting it across sub-agent calls
   would pay a fresh sub-agent-startup cost per cycle instead of once.
3. Typecheck often (`npm run typecheck`); run single test files as you go (`npx vitest run <path>`).
4. Run the full validation once, at the end: `node scripts/next-ticket/gate.mjs --build` (runs format:check/lint/typecheck/test:run concurrently, then build). `npm run format` auto-fixes formatting.
5. Run `/code-review` against the merge-base with `main` — its two axes run as parallel sub-agents, never inline. Address hard Standards violations and missing/wrong Spec findings.
6. Commit to the current branch. Conventional Commit subject; body ends with `Closes #<n>`.

## Keeping the context small

Implementation is the longest phase of a run, and every tool call re-sends the
whole conversation — so a call made late costs far more than the same call made
early. Beat 1 moves the one-shot, read-heavy work into a sub-agent for exactly
this reason (measured: sub-agent turns run at roughly half the per-turn cost
of a main-thread turn at this point in a run). What's left inline is the
TDD loop itself, which can't be delegated the same way — so within it: gather
all the changes you intend to make to a file and apply them in a single edit
rather than a stream of small ones, and run the validation gate as one script
call (beat 4), not a manual chain.

## This repo

- Pure engines stay pure: no `fetch`/DOM/Dexie imports in `src/engine`.
- ESI calls send `X-Compatibility-Date` and a descriptive `X-User-Agent`; respect `X-Ratelimit-*` and `Retry-After`.
- Refresh tokens live in Dexie only — never to Firebase or logs.
- All UI strings through i18next (`src/i18n/locales/en.json`), English only for now.
- One ticket per run. Each ticket is a vertical slice sized for one fresh context.

## What this skill does NOT do

It does not create a branch, open a PR, close the issue, tick acceptance-criteria boxes, or act on `/code-review` findings beyond the fixes above. `/next-ticket` owns branch/PR/merge/close.
