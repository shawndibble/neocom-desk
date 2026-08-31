# Domain Docs

How the engineering skills consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — glossary and scope decisions. Use its terms exactly.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- **`docs/DESIGN.md`** — design tokens and components, for any UI change.

If a file doesn't exist, proceed silently.

## Layout

Single-context repo:

```
/
├── CONTEXT.md
├── docs/
│   ├── DESIGN.md
│   ├── ARCHITECTURE.md
│   └── adr/
└── src/
```

## Use the glossary's vocabulary

When output names a domain concept (issue title, refactor proposal, hypothesis, test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms it avoids. If the concept isn't in the glossary, that's a signal: either you're inventing language the project doesn't use, or there's a real gap to note.

## Flag ADR conflicts

If output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007, but worth reopening because…_
