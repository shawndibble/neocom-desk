# Scope decisions — scope decisions move to one file each

_Recorded 2026-09-04._

- **`CONTEXT.md` is the glossary and nothing else.** Its 21 `Glossary (round N
additions)` headings are folded into a single `## Glossary` list, so a new
  term is inserted among its peers rather than appended after the last one.
  All 66 terms are carried over verbatim.
- **Scope decisions live one per file in `docs/context/decisions/`.** The 54
  `Scope decisions (round N)` sections that used to sit at the bottom of
  `CONTEXT.md` are now 54 files. Every heading, bullet and `###` subsection is
  carried over unchanged; the `round N` titles survive as each file's `#`
  heading, so the `(CONTEXT.md round 12)` comments already in
  `scripts/build-sde.mjs` and `docs/ARCHITECTURE.md` still resolve by grep.
  Those comments are deliberately left alone.
- **Why: the old layout conflicted structurally, not occasionally.** Several
  `/next-ticket` agents work this repo at once, and each finished ticket
  appended a new section to the same last line of one file. Git has no way to
  merge that. `CONTEXT.md` had 66 modifications and needed dedicated
  conflict-resolution commits (`d4ab05d`, `a88733e`). Distinct new paths merge
  without a conflict, which is the whole mechanism.
- **Filenames are timestamps, never sequence numbers**:
  `YYYYMMDD-HHMMSS-<slug>.md`, minted by `scripts/new-decision.mjs`. A number
  has to be _claimed_ — parallel agents read the same directory and all pick
  the same next value. That already happened here twice: `round 25` appears on
  two different sections, `round 24` was written after `round 25`, and
  `a88733e` is a commit resolving "a round-number collision with main". The
  round numbers are therefore retired as identifiers; the migrated titles are
  history, not a series to continue.
- **No index file, by design.** A generated or hand-kept list of these files
  would be one more shared last line for every agent to append to, recreating
  the conflict a level up. Filenames carry the topic and sort chronologically;
  `grep -rl` over the directory is the lookup.
