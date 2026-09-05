# Scope decisions

One file per decision. Append-only as a _directory_, never as a file.

`CONTEXT.md` at the repo root holds the glossary — the shared vocabulary,
read whole. This directory holds the decision log that used to live at the
bottom of it. Splitting them is not tidiness: several `/next-ticket` agents
run at once, and every one of them appending to the same last line of
`CONTEXT.md` conflicted on essentially every merge. Distinct new paths merge
without a conflict.

## Adding a decision

```sh
node scripts/new-decision.mjs "mail subject/sender search" [--issue 416]
```

It prints the path it created, pre-filled with a title and the recorded date.
Write the decisions into it as bullets, same voice as the existing files.

Doing it by hand is fine too — the filename is the only rule:

```
YYYYMMDD-HHMMSS-<kebab-slug>.md
```

The timestamp is **when you wrote it**, to the second. It is a stamp, not a
sequence number. Never number these files, never renumber them, and never
consult the directory to work out "the next" anything: two agents running in
parallel would both claim the same number, which is the failure this layout
exists to remove. The old "round N" headings are kept inside the migrated
files as historical titles only — do not continue the series.

## Reading them

- Locating a past decision: `grep -rl "<term>" docs/context/decisions/`.
- Newest decisions: `ls docs/context/decisions/2*.md | tail`. Filenames sort
  chronologically.
- There is deliberately **no index file** listing these. An index is one more
  shared last line for every agent to append to, which recreates the conflict
  one level up. The filenames and `grep` are the index.

## New vocabulary

A term the whole project will reuse belongs in the glossary in root
`CONTEXT.md`. That list is sorted by term — insert yours in alphabetical
position, never at the end. A mid-file insert is why it seldom conflicts.
Write the term there and the decision here.
