# Domain Docs

How the engineering skills consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the glossary. Use its terms exactly.
- **`docs/context/decisions/`** — past scope decisions, one file per decision.
  Don't read all of them; `grep -rl "<term>" docs/context/decisions/` for the
  ones touching your area, and `ls | tail` for the most recent.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- **`docs/DESIGN.md`** — design tokens and components, for any UI change.

If a file doesn't exist, proceed silently.

## Layout

Single-context repo:

```
/
├── CONTEXT.md              glossary only
├── docs/
│   ├── DESIGN.md
│   ├── ARCHITECTURE.md
│   ├── adr/
│   └── context/decisions/  one timestamped file per scope decision
└── src/
```

## Writing a scope decision

Never append to `CONTEXT.md`. Create a new file:

```sh
node scripts/new-decision.mjs "<title>" [--issue <number>]
```

The filename is `YYYYMMDD-HHMMSS-<slug>.md` — a timestamp, never a sequence
number. Several agents work this repo in parallel; a shared last line, and any
"next number" scheme, both make every one of them collide. Distinct new paths
merge cleanly. Full rules: `docs/context/decisions/README.md`.

A genuinely new domain term still goes in the `CONTEXT.md` glossary. That list
is sorted alphabetically by term, and it is kept that way for the same reason
this directory exists: an alphabetical insert lands in the middle of the file,
so two agents adding terms under different letters never touch the same lines.
Insert in sorted position. Never append to the end.

## Use the glossary's vocabulary

When output names a domain concept (issue title, refactor proposal, hypothesis, test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms it avoids. If the concept isn't in the glossary, that's a signal: either you're inventing language the project doesn't use, or there's a real gap to note.

## Flag ADR conflicts

If output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007, but worth reopening because…_
