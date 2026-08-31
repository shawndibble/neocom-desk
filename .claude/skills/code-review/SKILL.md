---
name: code-review
description: 'Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo''s documented coding standards?) and Spec (does the code match what the originating issue/spec asked for?). Runs both reviews and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to "review since X".'
---

Two-axis review of the diff between `HEAD` and a fixed point:

- **Standards**: does the code conform to this repo's documented coding standards?
- **Spec**: does the code faithfully implement the originating issue / spec?

The two axes are kept **separate** so one never masks the other. Run them as parallel sub-agents when a human is driving; run them inline as two distinct passes when unattended (e.g. inside `/next-ticket`). Either way, do not merge or rerank findings across axes.

The issue tracker config is at `docs/agents/issue-tracker.md`.

## Process

### 1. Pin the fixed point

The fixed point is whatever the caller supplies (a commit SHA, branch name, tag, `main`, `HEAD~5`). Inside `/next-ticket` it is the merge-base with `main`.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, against the merge-base). Note the commits via `git log <fixed-point>..HEAD --oneline`.

Confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty before going further.

### 2. Identify the spec source

Look for the originating spec, in order:

1. Issue references in the commit messages (`#123`, `Closes #45`), fetched via `docs/agents/issue-tracker.md` (`gh issue view <n> --comments`).
2. A path passed as an argument.
3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, the **Spec** axis reports "no spec available".

### 3. Identify the standards sources

Repo docs that describe how code should be written: `CLAUDE.md`, `CONTEXT.md`, `docs/DESIGN.md`, `docs/adr/`, `eslint.config.js`, `.prettierrc`.

On top of the repo's own rules, the Standards axis always carries the **smell baseline**: a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing.

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Skip anything tooling (`npm run lint`, `npm run format:check`, `npm run typecheck`) already enforces.

Each smell reads _what it is_ → _how to fix_; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together. → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches**: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

Repo-specific hard rules to check (from `CLAUDE.md`):

- Pure engines under `src/engine` have no `fetch`/DOM/Dexie imports.
- ESI calls send `X-Compatibility-Date` and a descriptive `X-User-Agent`; they respect `X-Ratelimit-*` and `Retry-After`.
- Refresh tokens live in Dexie only — never sent to Firebase or logs.
- All user-facing strings go through i18next (`src/i18n/locales/en.json`).

### 4. Run both axes

**Standards axis** — report, per file/hunk: (a) every place the diff violates a documented standard (cite the standard); (b) any baseline smell (name it, quote the hunk). Distinguish hard violations from judgement calls. Skip what tooling enforces.

**Spec axis** — report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but wrong. Quote the spec line for each finding. If no spec, skip and note it.

### 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings. Do **not** merge or rerank across axes.

End with a one-line summary: total findings per axis, and the worst issue _within each axis_.

## Inside /next-ticket

`code-review` here is advisory, not a gate. Address any **hard** Standards violation and any **missing/wrong** Spec finding before pushing. Judgement-call smells: fix if cheap, otherwise note them in the PR body under "Review notes". The gate that actually blocks the PR is CI (`npm run format:check`, `lint`, `typecheck`, `test:run`, `build`, e2e).
